import { Router } from "express";
import { Types } from "mongoose";
import Task, { TASK_STATUSES, TaskStatus, serializeTask } from "../models/Task";
import { asyncHandler } from "../middleware/miscellaneous";
import { requireAuth } from "../middleware/auth";
import { clearEditing, emitToAll } from "../realtime";

const router = Router();
router.use(requireAuth);

const POSITION_STEP = 1000;

const isStatus = (value: unknown): value is TaskStatus =>
  typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);

const validId = (id: string): boolean => Types.ObjectId.isValid(id);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const tasks = await Task.find().sort({ position: 1, _id: 1 });
    res.json({ success: true, tasks: tasks.map(serializeTask) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description : "";
    const status: TaskStatus = isStatus(req.body?.status) ? req.body.status : "todo";

    if (!title || title.length > 120) {
      res.status(400).json({ success: false, message: "Title is required (max 120 characters)" });
      return;
    }

    // Offline clients send a clientId so that replaying the same create is harmless
    const clientId =
      typeof req.body?.clientId === "string" && req.body.clientId.length < 64
        ? req.body.clientId
        : undefined;
    if (clientId) {
      const existing = await Task.findOne({ clientId });
      if (existing) {
        res.json({ success: true, task: serializeTask(existing) });
        return;
      }
    }

    // New cards go to the bottom of their column, unless the client picked a position
    let position: number;
    if (typeof req.body?.position === "number" && Number.isFinite(req.body.position)) {
      position = req.body.position;
    } else {
      const last = await Task.findOne({ status }).sort({ position: -1 });
      position = last ? last.position + POSITION_STEP : POSITION_STEP;
    }

    let task;
    try {
      task = await Task.create({
        title,
        description,
        status,
        position,
        clientId,
        createdBy: user.id,
        createdByName: user.username,
        updatedByName: user.username,
      });
    } catch (err) {
      // Two replays of the same offline create racing each other
      if (clientId && (err as { code?: number }).code === 11000) {
        const existing = await Task.findOne({ clientId });
        if (existing) {
          res.json({ success: true, task: serializeTask(existing) });
          return;
        }
      }
      throw err;
    }

    const payload = serializeTask(task);
    emitToAll("task:created", payload);
    res.status(201).json({ success: true, task: payload });
  })
);

// Content edit with optimistic concurrency. The client sends the version it last saw.
// If someone saved in the meantime, nothing is written and the latest copy is returned.
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;
    if (!validId(id)) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    const version = req.body?.version;
    if (typeof version !== "number") {
      res.status(400).json({ success: false, message: "version is required" });
      return;
    }

    const changes: { title?: string; description?: string } = {};
    if (req.body?.title !== undefined) {
      const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
      if (!title || title.length > 120) {
        res.status(400).json({ success: false, message: "Title is required (max 120 characters)" });
        return;
      }
      changes.title = title;
    }
    if (req.body?.description !== undefined) {
      if (typeof req.body.description !== "string" || req.body.description.length > 2000) {
        res.status(400).json({ success: false, message: "Description is too long" });
        return;
      }
      changes.description = req.body.description;
    }

    const updated = await Task.findOneAndUpdate(
      { _id: id, version },
      { $set: { ...changes, updatedByName: user.username }, $inc: { version: 1 } },
      { new: true }
    );

    if (!updated) {
      const current = await Task.findById(id);
      if (!current) {
        res.status(404).json({ success: false, message: "Task not found" });
        return;
      }
      res.status(409).json({
        success: false,
        message: `${current.updatedByName} changed this task while you were editing it`,
        task: serializeTask(current),
      });
      return;
    }

    const payload = serializeTask(updated);
    emitToAll("task:updated", payload);
    res.json({ success: true, task: payload });
  })
);

// Moving only touches placement (status + position), never the content, and it does not
// bump the content version. Two people dragging at once just means the last drop wins,
// and an open edit form is not invalidated by someone else dragging the card.
router.post(
  "/:id/move",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;
    if (!validId(id)) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    const { status, position } = req.body ?? {};
    if (!isStatus(status) || typeof position !== "number" || !Number.isFinite(position)) {
      res.status(400).json({ success: false, message: "Valid status and position are required" });
      return;
    }

    const moved = await Task.findByIdAndUpdate(
      id,
      { $set: { status, position, updatedByName: user.username } },
      { new: true }
    );
    if (!moved) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    const payload = serializeTask(moved);
    emitToAll("task:moved", payload);
    res.json({ success: true, task: payload });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!validId(id)) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    const deleted = await Task.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    clearEditing(id);
    emitToAll("task:deleted", { id });
    res.json({ success: true });
  })
);

export default router;

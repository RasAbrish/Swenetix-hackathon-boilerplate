import type { ThunkAction, ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import { api, ApiError } from "../../lib/api";
import {
  enqueue,
  getQueue,
  OutboxOp,
  remapTaskId,
  setQueue,
  tempIdFor,
} from "../../lib/outbox";
import type { Task, TaskStatus } from "../../types";
import {
  conflictAdded,
  conflictDismissed,
  Conflict,
  noticeSet,
  pendingChanged,
  taskPatchedLocally,
  taskRemoved,
  taskUpserted,
  tasksLoaded,
  tasksLoadFailed,
  tasksLoadStarted,
  tempTaskAdded,
  tempTaskReplaced,
} from "./tasksSlice";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;
type Dispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

export type SaveResult = { ok: true } | { ok: false; conflict?: Task; message: string };

const newId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const isNetworkError = (e: unknown): boolean => (e as ApiError).status === 0;

const browserOnline = (): boolean => typeof navigator === "undefined" || navigator.onLine !== false;

// While anything is waiting in the outbox, new changes queue up behind it so order is kept.
const shouldQueue = (): boolean => !browserOnline() || getQueue().length > 0;

let flushing = false;
let inFlightOpId: string | undefined;

const queueOp = (dispatch: Dispatch, op: OutboxOp): void => {
  setQueue(enqueue(getQueue(), op, inFlightOpId));
  dispatch(pendingChanged(getQueue().length));
};

export const fetchTasks = (): AppThunk<Promise<void>> => async (dispatch) => {
  // Loading from the server now would wipe out changes that are still waiting to be synced
  if (getQueue().length > 0) return;
  dispatch(tasksLoadStarted());
  try {
    const res = await api<{ tasks: Task[] }>("/api/tasks");
    dispatch(tasksLoaded(res.tasks));
  } catch (e) {
    dispatch(tasksLoadFailed((e as ApiError).message));
  }
};

export const createTask =
  (input: { title: string; status: TaskStatus }): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const clientId = newId();

    const queueIt = () => {
      const state = getState();
      const name = state.auth.user?.username ?? "you";
      const column = state.tasks.items.filter((t) => t.status === input.status);
      const position = column.length ? Math.max(...column.map((t) => t.position)) + 1000 : 1000;
      const now = new Date().toISOString();
      dispatch(
        tempTaskAdded({
          id: tempIdFor(clientId),
          title: input.title,
          description: "",
          status: input.status,
          position,
          version: 0,
          createdBy: name,
          updatedBy: name,
          createdAt: now,
          updatedAt: now,
        })
      );
      queueOp(dispatch, {
        opId: newId(),
        type: "create",
        clientId,
        title: input.title,
        description: "",
        status: input.status,
        position,
      });
    };

    if (shouldQueue()) {
      queueIt();
      dispatch(syncNow());
      return;
    }
    try {
      const res = await api<{ task: Task }>("/api/tasks", {
        method: "POST",
        body: { ...input, clientId },
      });
      dispatch(taskUpserted(res.task));
    } catch (e) {
      if (isNetworkError(e)) queueIt();
      else dispatch(noticeSet((e as ApiError).message));
    }
  };

export const updateTask =
  (input: {
    id: string;
    version: number;
    title: string;
    description: string;
  }): AppThunk<Promise<SaveResult>> =>
  async (dispatch) => {
    const queueIt = (): SaveResult => {
      dispatch(
        taskPatchedLocally({ id: input.id, title: input.title, description: input.description })
      );
      queueOp(dispatch, {
        opId: newId(),
        type: "update",
        taskId: input.id,
        baseVersion: input.version,
        title: input.title,
        description: input.description,
      });
      return { ok: true };
    };

    if (shouldQueue()) {
      const result = queueIt();
      dispatch(syncNow());
      return result;
    }
    try {
      const res = await api<{ task: Task }>(`/api/tasks/${input.id}`, {
        method: "PATCH",
        body: { version: input.version, title: input.title, description: input.description },
      });
      dispatch(taskUpserted(res.task));
      return { ok: true };
    } catch (e) {
      if (isNetworkError(e)) return queueIt();
      const err = e as ApiError;
      if (err.status === 409 && err.data?.task) {
        return { ok: false, conflict: err.data.task as Task, message: err.message };
      }
      return { ok: false, message: err.message };
    }
  };

export const moveTask =
  (input: { id: string; status: TaskStatus; position: number }): AppThunk<Promise<void>> =>
  async (dispatch) => {
    const queueIt = () =>
      queueOp(dispatch, {
        opId: newId(),
        type: "move",
        taskId: input.id,
        status: input.status,
        position: input.position,
      });

    // The card jumps immediately either way
    dispatch(taskPatchedLocally(input));

    if (shouldQueue()) {
      queueIt();
      dispatch(syncNow());
      return;
    }
    try {
      const res = await api<{ task: Task }>(`/api/tasks/${input.id}/move`, {
        method: "POST",
        body: { status: input.status, position: input.position },
      });
      dispatch(taskUpserted(res.task));
    } catch (e) {
      if (isNetworkError(e)) queueIt();
      else dispatch(fetchTasks());
    }
  };

export const deleteTask =
  (id: string): AppThunk<Promise<void>> =>
  async (dispatch) => {
    const queueIt = () => queueOp(dispatch, { opId: newId(), type: "delete", taskId: id });

    dispatch(taskRemoved(id));

    if (shouldQueue()) {
      queueIt();
      dispatch(syncNow());
      return;
    }
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 404) return; // someone else already deleted it
      if (isNetworkError(e)) queueIt();
      else dispatch(fetchTasks());
    }
  };

// Sends one queued change. Throws only for problems that should stop or drop the operation.
const sendOp = async (op: OutboxOp, dispatch: Dispatch): Promise<void> => {
  switch (op.type) {
    case "create": {
      const res = await api<{ task: Task }>("/api/tasks", {
        method: "POST",
        body: {
          title: op.title,
          description: op.description,
          status: op.status,
          position: op.position,
          clientId: op.clientId,
        },
      });
      const tempId = tempIdFor(op.clientId);
      // Later queued changes to this card must now point at its real id
      setQueue(remapTaskId(getQueue(), tempId, res.task.id));
      dispatch(tempTaskReplaced({ tempId, task: res.task }));
      return;
    }
    case "update": {
      try {
        const res = await api<{ task: Task }>(`/api/tasks/${op.taskId}`, {
          method: "PATCH",
          body: { version: op.baseVersion, title: op.title, description: op.description },
        });
        dispatch(taskUpserted(res.task));
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 409 && err.data?.task) {
          // Someone else changed this card while we were offline. Nothing was overwritten:
          // show their version and let the user decide what to do with ours.
          const theirs = err.data.task as Task;
          dispatch(taskUpserted(theirs));
          dispatch(
            conflictAdded({
              id: op.opId,
              taskId: op.taskId,
              mine: { title: op.title, description: op.description },
              theirs,
            })
          );
          return;
        }
        if (err.status === 404) return; // the card was deleted meanwhile
        throw e;
      }
      return;
    }
    case "move": {
      try {
        const res = await api<{ task: Task }>(`/api/tasks/${op.taskId}/move`, {
          method: "POST",
          body: { status: op.status, position: op.position },
        });
        dispatch(taskUpserted(res.task));
      } catch (e) {
        if ((e as ApiError).status === 404) return;
        throw e;
      }
      return;
    }
    case "delete": {
      try {
        await api(`/api/tasks/${op.taskId}`, { method: "DELETE" });
      } catch (e) {
        if ((e as ApiError).status === 404) return;
        throw e;
      }
      return;
    }
  }
};

export const flushOutbox = (): AppThunk<Promise<void>> => async (dispatch) => {
  // No point trying while the browser knows it is offline; the 'online' event retries
  if (flushing || !browserOnline()) return;
  flushing = true;
  try {
    while (getQueue().length > 0 && browserOnline()) {
      const op = getQueue()[0];
      inFlightOpId = op.opId;
      try {
        await sendOp(op, dispatch);
      } catch (e) {
        if (isNetworkError(e)) return; // still unreachable: keep everything and retry later
        dispatch(noticeSet(`A change could not be synced: ${(e as ApiError).message}`));
      }
      setQueue(getQueue().filter((o) => o.opId !== op.opId));
      dispatch(pendingChanged(getQueue().length));
    }
  } finally {
    inFlightOpId = undefined;
    flushing = false;
  }
};

// Push local changes first, then pull the latest board.
export const syncNow = (): AppThunk<Promise<void>> => async (dispatch) => {
  await dispatch(flushOutbox());
  if (getQueue().length === 0) await dispatch(fetchTasks());
};

// "Keep mine" on an offline conflict: resend my text on top of the newest version.
export const keepMineForConflict =
  (conflict: Conflict): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const live = getState().tasks.items.find((t) => t.id === conflict.taskId);
    dispatch(conflictDismissed(conflict.id));
    const result = await dispatch(
      updateTask({
        id: conflict.taskId,
        version: live?.version ?? conflict.theirs.version,
        title: conflict.mine.title,
        description: conflict.mine.description,
      })
    );
    if (!result.ok) dispatch(noticeSet(result.message));
  };

// "Keep theirs": nothing to send, just drop the conflict.
export const keepTheirsForConflict =
  (conflict: Conflict): AppThunk =>
  (dispatch) => {
    dispatch(conflictDismissed(conflict.id));
  };

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { AuthUser, verifyToken } from "./middleware/auth";

let io: Server | null = null;

interface OnlineEntry {
  username: string;
  sockets: Set<string>;
}

interface EditingEntry {
  taskId: string;
  userId: string;
  username: string;
  socketId: string;
  timer: NodeJS.Timeout;
}

// Editing flags expire on their own unless the client keeps refreshing them,
// so a crashed tab cannot leave a task marked as "being edited" forever.
const EDITING_TTL_MS = 30_000;

const online = new Map<string, OnlineEntry>();
const editing = new Map<string, EditingEntry>();

const presenceList = () =>
  Array.from(online.entries()).map(([id, entry]) => ({ id, username: entry.username }));

const editingList = () =>
  Array.from(editing.values()).map(({ taskId, userId, username }) => ({
    taskId,
    userId,
    username,
  }));

const broadcastPresence = (): void => {
  io?.emit("presence:update", presenceList());
};

const broadcastEditing = (): void => {
  io?.emit("editing:update", editingList());
};

const dropEditing = (taskId: string): boolean => {
  const entry = editing.get(taskId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  editing.delete(taskId);
  return true;
};

export const emitToAll = (event: string, payload: unknown): void => {
  io?.emit(event, payload);
};

export const clearEditing = (taskId: string): void => {
  if (dropEditing(taskId)) broadcastEditing();
};

const isTaskId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length < 64;

const registerHandlers = (socket: Socket, user: AuthUser): void => {
  socket.on("task:editing:start", (payload: { taskId?: unknown }) => {
    const taskId = payload?.taskId;
    if (!isTaskId(taskId)) return;

    const existing = editing.get(taskId);
    
    if (existing && existing.userId !== user.id) return;

    const isNew = !existing;
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      editing.delete(taskId);
      broadcastEditing();
    }, EDITING_TTL_MS);

    editing.set(taskId, {
      taskId,
      userId: user.id,
      username: user.username,
      socketId: socket.id,
      timer,
    });
    if (isNew) broadcastEditing();
  });

  socket.on("task:editing:stop", (payload: { taskId?: unknown }) => {
    const taskId = payload?.taskId;
    if (!isTaskId(taskId)) return;
    const entry = editing.get(taskId);
    if (entry && entry.socketId === socket.id) {
      dropEditing(taskId);
      broadcastEditing();
    }
  });

  socket.on("disconnect", () => {
    // Presence is per user, not per tab: only go offline when the last tab closes.
    const entry = online.get(user.id);
    if (entry) {
      entry.sockets.delete(socket.id);
      if (entry.sockets.size === 0) online.delete(user.id);
    }

    let editingChanged = false;
    for (const [taskId, e] of Array.from(editing.entries())) {
      if (e.socketId === socket.id) {
        dropEditing(taskId);
        editingChanged = true;
      }
    }

    broadcastPresence();
    if (editingChanged) broadcastEditing();
  });
};

export const initRealtime = (server: HttpServer): void => {
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || "http://localhost:3000" },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") {
      next(new Error("Not authenticated"));
      return;
    }
    try {
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthUser;

    const entry = online.get(user.id) ?? { username: user.username, sockets: new Set<string>() };
    entry.sockets.add(socket.id);
    online.set(user.id, entry);

    registerHandlers(socket, user);

    // Tell everyone who is online, and catch the newcomer up on who is editing what.
    broadcastPresence();
    socket.emit("editing:update", editingList());
  });
};

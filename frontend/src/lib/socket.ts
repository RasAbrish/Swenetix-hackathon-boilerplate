import { io, Socket } from "socket.io-client";
import { API_URL } from "./api";

let socket: Socket | null = null;

export const connectSocket = (token: string): Socket => {
  if (socket) socket.disconnect();
  socket = io(API_URL, { auth: { token } });
  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const emitEditingStart = (taskId: string): void => {
  socket?.emit("task:editing:start", { taskId });
};

export const emitEditingStop = (taskId: string): void => {
  socket?.emit("task:editing:stop", { taskId });
};

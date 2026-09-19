import { useEffect } from "react";
import { useAppDispatch } from "../../app/hooks";
import { connectSocket, disconnectSocket } from "../../lib/socket";
import { connectionChanged, editingUpdated, presenceUpdated } from "../presence/presenceSlice";
import { taskRemoved, taskUpserted } from "../tasks/tasksSlice";
import { syncNow } from "../tasks/tasksThunks";
import type { EditingInfo, OnlineUser, Task } from "../../types";

export function useRealtime(token: string | null): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!token) return;

    // Send anything saved from a previous session and load the board over HTTP right away,
    // so it works even if the socket is slow to connect
    dispatch(syncNow());

    const socket = connectSocket(token);

    // Every (re)connect: push offline changes first, then pull what we missed
    socket.on("connect", () => {
      dispatch(connectionChanged(true));
      dispatch(syncNow());
    });
    socket.on("disconnect", () => dispatch(connectionChanged(false)));
    socket.on("connect_error", () => dispatch(connectionChanged(false)));

    socket.on("task:created", (task: Task) => dispatch(taskUpserted(task)));
    socket.on("task:updated", (task: Task) => dispatch(taskUpserted(task)));
    socket.on("task:moved", (task: Task) => dispatch(taskUpserted(task)));
    socket.on("task:deleted", ({ id }: { id: string }) => dispatch(taskRemoved(id)));

    socket.on("presence:update", (users: OnlineUser[]) => dispatch(presenceUpdated(users)));
    socket.on("editing:update", (list: EditingInfo[]) => dispatch(editingUpdated(list)));

    const onOnline = () => dispatch(syncNow());
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", onOnline);
      disconnectSocket();
      dispatch(connectionChanged(false));
    };
  }, [token, dispatch]);
}

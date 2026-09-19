import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import { logout } from "../auth/authSlice";
import { getQueue, isTempId } from "../../lib/outbox";
import { readJSON, TASKS_CACHE_KEY } from "../../lib/storage";
import type { Task, TaskStatus } from "../../types";

// An offline edit that collided with a newer change made by someone else
export interface Conflict {
  id: string;
  taskId: string;
  mine: { title: string; description: string };
  theirs: Task;
}

interface TasksState {
  items: Task[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  // Number of changes waiting to be synced
  pending: number;
  conflicts: Conflict[];
  notice: string | null;
}

// The last known board is cached, so a page reload while offline still shows something.
const cached = readJSON<Task[]>(TASKS_CACHE_KEY, []);

const initialState: TasksState = {
  items: cached,
  status: cached.length > 0 ? "ready" : "idle",
  error: null,
  pending: getQueue().length,
  conflicts: [],
  notice: null,
};

// Server events and HTTP responses can arrive in either order, so never let an older
// copy overwrite a newer one. Everything here is idempotent for the same reason.
const upsert = (state: TasksState, task: Task): void => {
  const index = state.items.findIndex((t) => t.id === task.id);
  if (index === -1) {
    state.items.push(task);
  } else if (state.items[index].updatedAt <= task.updatedAt) {
    state.items[index] = task;
  }
};

type LocalPatch = { id: string } & Partial<Pick<Task, "title" | "description" | "status" | "position">>;

const tasksSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    tasksLoadStarted: (state) => {
      if (state.status === "idle") state.status = "loading";
    },
    tasksLoaded: (state, action: PayloadAction<Task[]>) => {
      // Cards that only exist locally (created offline) survive a reload from the server
      const localOnly = state.items.filter((t) => isTempId(t.id));
      state.items = [...action.payload, ...localOnly];
      state.status = "ready";
      state.error = null;
    },
    tasksLoadFailed: (state, action: PayloadAction<string>) => {
      if (state.status !== "ready") state.status = "error";
      state.error = action.payload;
    },
    taskUpserted: (state, action: PayloadAction<Task>) => {
      upsert(state, action.payload);
    },
    taskRemoved: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((t) => t.id !== action.payload);
    },
    // Optimistic change: the UI updates now, the server is told now or later
    taskPatchedLocally: (state, action: PayloadAction<LocalPatch>) => {
      const { id, ...changes } = action.payload;
      const task = state.items.find((t) => t.id === id);
      if (task) Object.assign(task, changes);
    },
    tempTaskAdded: (state, action: PayloadAction<Task>) => {
      state.items.push(action.payload);
    },
    tempTaskReplaced: (state, action: PayloadAction<{ tempId: string; task: Task }>) => {
      state.items = state.items.filter((t) => t.id !== action.payload.tempId);
      upsert(state, action.payload.task);
    },
    pendingChanged: (state, action: PayloadAction<number>) => {
      state.pending = action.payload;
    },
    conflictAdded: (state, action: PayloadAction<Conflict>) => {
      state.conflicts.push(action.payload);
    },
    conflictDismissed: (state, action: PayloadAction<string>) => {
      state.conflicts = state.conflicts.filter((c) => c.id !== action.payload);
    },
    noticeSet: (state, action: PayloadAction<string | null>) => {
      state.notice = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logout.fulfilled, () => ({
      items: [],
      status: "idle" as const,
      error: null,
      pending: 0,
      conflicts: [],
      notice: null,
    }));
  },
});

export const {
  tasksLoadStarted,
  tasksLoaded,
  tasksLoadFailed,
  taskUpserted,
  taskRemoved,
  taskPatchedLocally,
  tempTaskAdded,
  tempTaskReplaced,
  pendingChanged,
  conflictAdded,
  conflictDismissed,
  noticeSet,
} = tasksSlice.actions;
export default tasksSlice.reducer;

const selectItems = (state: RootState) => state.tasks.items;

export const selectTasksByStatus = createSelector([selectItems], (items) => {
  const columns: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
  items.forEach((task) => columns[task.status].push(task));
  (Object.keys(columns) as TaskStatus[]).forEach((key) =>
    columns[key].sort(
      (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)
    )
  );
  return columns;
});

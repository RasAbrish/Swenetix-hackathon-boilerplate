export type TaskStatus = "todo" | "in_progress" | "done";

export const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
}

export interface OnlineUser {
  id: string;
  username: string;
}

export interface EditingInfo {
  taskId: string;
  userId: string;
  username: string;
}

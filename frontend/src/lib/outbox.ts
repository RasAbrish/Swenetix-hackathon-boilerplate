import type { TaskStatus } from "../types";
import { OUTBOX_KEY, readJSON, writeJSON } from "./storage";

// Changes made while offline wait here (and in localStorage) until they can be replayed.
export type CreateOp = {
  opId: string;
  type: "create";
  clientId: string;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
};
export type UpdateOp = {
  opId: string;
  type: "update";
  taskId: string;
  baseVersion: number;
  title: string;
  description: string;
};
export type MoveOp = {
  opId: string;
  type: "move";
  taskId: string;
  status: TaskStatus;
  position: number;
};
export type DeleteOp = { opId: string; type: "delete"; taskId: string };
export type OutboxOp = CreateOp | UpdateOp | MoveOp | DeleteOp;

// A card created offline lives under a temporary id until the server gives it a real one.
export const TEMP_PREFIX = "tmp_";
export const isTempId = (id: string): boolean => id.startsWith(TEMP_PREFIX);
export const tempIdFor = (clientId: string): string => TEMP_PREFIX + clientId;

// Adds an operation, collapsing it into earlier pending work on the same task so the
// replay sends as little as possible. `lockedOpId` is the operation currently being sent:
// it must not be changed underneath the request that is already in flight.
export function enqueue(queue: OutboxOp[], op: OutboxOp, lockedOpId?: string): OutboxOp[] {
  if (op.type === "create") return [...queue, op];

  const q = queue.slice();
  const taskId = op.taskId;
  const free = (o: OutboxOp): boolean => o.opId !== lockedOpId;
  const touches = (o: OutboxOp): boolean => o.type !== "create" && o.taskId === taskId;

  // The task only exists locally so far: fold the change into its pending create
  const createIdx = q.findIndex(
    (o) => o.type === "create" && tempIdFor(o.clientId) === taskId && free(o)
  );
  if (createIdx !== -1) {
    const create = q[createIdx] as CreateOp;
    if (op.type === "delete") {
      // Created and deleted while offline: the server never needs to hear about it
      return q.filter((o) => o !== create && !touches(o));
    }
    if (op.type === "update") {
      q[createIdx] = { ...create, title: op.title, description: op.description };
      return q;
    }
    q[createIdx] = { ...create, status: op.status, position: op.position };
    return q;
  }

  if (op.type === "delete") {
    // A delete makes earlier edits and moves of the same task pointless
    return [...q.filter((o) => !touches(o) || !free(o)), op];
  }

  if (op.type === "move") {
    const i = q.findIndex((o) => o.type === "move" && o.taskId === taskId && free(o));
    if (i !== -1) {
      q[i] = { ...op, opId: q[i].opId };
      return q;
    }
    return [...q, op];
  }

  const i = q.findIndex((o) => o.type === "update" && o.taskId === taskId && free(o));
  if (i !== -1) {
    // Keep the FIRST base version: it is the version the user actually started from
    q[i] = { ...(q[i] as UpdateOp), title: op.title, description: op.description };
    return q;
  }
  return [...q, op];
}

// After a create succeeds, later operations that pointed at the temp id must use the real id.
export function remapTaskId(queue: OutboxOp[], from: string, to: string): OutboxOp[] {
  return queue.map((o) => (o.type !== "create" && o.taskId === from ? { ...o, taskId: to } : o));
}

let queue: OutboxOp[] = readJSON<OutboxOp[]>(OUTBOX_KEY, []);

export const getQueue = (): OutboxOp[] => queue;

export const setQueue = (next: OutboxOp[]): void => {
  queue = next;
  writeJSON(OUTBOX_KEY, next);
};

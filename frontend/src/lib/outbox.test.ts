import { enqueue, remapTaskId, tempIdFor, OutboxOp } from "./outbox";

const update = (opId: string, taskId: string, baseVersion: number, title: string): OutboxOp => ({
  opId,
  type: "update",
  taskId,
  baseVersion,
  title,
  description: "",
});
const move = (opId: string, taskId: string, position: number): OutboxOp => ({
  opId,
  type: "move",
  taskId,
  status: "done",
  position,
});
const create = (opId: string, clientId: string): OutboxOp => ({
  opId,
  type: "create",
  clientId,
  title: "New",
  description: "",
  status: "todo",
  position: 1000,
});

test("two edits of the same task collapse and keep the first base version", () => {
  let q = enqueue([], update("a", "t1", 3, "first"));
  q = enqueue(q, update("b", "t1", 4, "second"));
  expect(q).toHaveLength(1);
  expect(q[0]).toMatchObject({ type: "update", baseVersion: 3, title: "second" });
});

test("two moves of the same task keep only the latest position", () => {
  let q = enqueue([], move("a", "t1", 100));
  q = enqueue(q, move("b", "t1", 250));
  expect(q).toHaveLength(1);
  expect(q[0]).toMatchObject({ type: "move", position: 250 });
});

test("edits and moves of a task created offline fold into the create", () => {
  const temp = tempIdFor("c1");
  let q = enqueue([], create("a", "c1"));
  q = enqueue(q, update("b", temp, 0, "Renamed"));
  q = enqueue(q, move("c", temp, 42));
  expect(q).toHaveLength(1);
  expect(q[0]).toMatchObject({ type: "create", title: "Renamed", status: "done", position: 42 });
});

test("creating and then deleting offline sends nothing", () => {
  const temp = tempIdFor("c1");
  let q = enqueue([], create("a", "c1"));
  q = enqueue(q, update("b", temp, 0, "x"));
  q = enqueue(q, { opId: "d", type: "delete", taskId: temp });
  expect(q).toEqual([]);
});

test("a delete supersedes earlier edits and moves of that task", () => {
  let q = enqueue([], update("a", "t1", 1, "x"));
  q = enqueue(q, move("b", "t1", 5));
  q = enqueue(q, update("c", "t2", 1, "keep me"));
  q = enqueue(q, { opId: "d", type: "delete", taskId: "t1" });
  expect(q.map((o) => o.opId)).toEqual(["c", "d"]);
});

test("the operation currently being sent is never modified", () => {
  let q = enqueue([], update("a", "t1", 3, "in flight"));
  q = enqueue(q, update("b", "t1", 3, "typed while sending"), "a");
  expect(q).toHaveLength(2);
  expect(q[0]).toMatchObject({ opId: "a", title: "in flight" });
});

test("remapTaskId points later operations at the real id", () => {
  const q = remapTaskId([update("a", "tmp_c1", 0, "x"), move("b", "other", 1)], "tmp_c1", "real1");
  expect(q[0]).toMatchObject({ taskId: "real1" });
  expect(q[1]).toMatchObject({ taskId: "other" });
});

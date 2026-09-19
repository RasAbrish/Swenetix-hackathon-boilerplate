
const { io } = require("socket.io-client");

const BASE = process.env.BASE || "http://localhost:5000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;

const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(extra)}`);
  if (!ok) failed++;
};

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function listen(token) {
  const s = io(BASE, { auth: { token }, forceNew: true });
  const seen = { events: [], presence: [], editing: [] };
  ["task:created", "task:updated", "task:moved", "task:deleted"].forEach((e) =>
    s.on(e, (p) => seen.events.push([e, p]))
  );
  s.on("presence:update", (l) => (seen.presence = l));
  s.on("editing:update", (l) => (seen.editing = l));
  return { s, seen };
}

const got = (seen, event, pred = () => true) =>
  seen.events.some(([e, p]) => e === event && pred(p));

(async () => {
  const suffix = Math.random().toString(36).slice(2, 7);
  const alice = { username: `alice_${suffix}`, password: "secret123" };
  const bob = { username: `bob_${suffix}`, password: "secret123" };

  const health = await call("GET", "/");
  check("server is up", health.status === 200, health);

  const ra = await call("POST", "/api/auth/register", null, alice);
  const rb = await call("POST", "/api/auth/register", null, bob);
  check("register two users", ra.status === 201 && rb.status === 201, [ra, rb]);
  const ta = ra.data.token;
  const tb = rb.data.token;

  const dup = await call("POST", "/api/auth/register", null, { ...alice, username: alice.username.toUpperCase() });
  check("duplicate username rejected (case-insensitive)", dup.status === 409, dup);

  const bad = await call("POST", "/api/auth/login", null, { username: alice.username, password: "wrong" });
  check("wrong password rejected", bad.status === 401, bad);

  const login = await call("POST", "/api/auth/login", null, alice);
  check("login works", login.status === 200 && !!login.data.token, login);

  const noAuth = await call("GET", "/api/tasks");
  check("tasks require auth", noAuth.status === 401, noAuth);

  const A = listen(ta);
  const B = listen(tb);
  await sleep(500);
  check("both users show as online", B.seen.presence.length >= 2, B.seen.presence);

  const created = await call("POST", "/api/tasks", ta, { title: "Smoke test task", status: "todo" });
  check("create task", created.status === 201 && created.data.task.version === 0, created);
  const id = created.data.task.id;
  await sleep(300);
  check("bob sees task:created live", got(B.seen, "task:created", (t) => t.id === id));

  const badCreate = await call("POST", "/api/tasks", ta, { title: "   " });
  check("empty title rejected", badCreate.status === 400, badCreate);

  const c1 = await call("POST", "/api/tasks", ta, { title: "Offline one", clientId: `c_${suffix}` });
  const c2 = await call("POST", "/api/tasks", ta, { title: "Offline one", clientId: `c_${suffix}` });
  check("replayed create with same clientId is not duplicated", c1.data.task.id === c2.data.task.id, [c1.data, c2.data]);

  const e1 = await call("PATCH", `/api/tasks/${id}`, ta, { version: 0, title: "Edited by alice" });
  check("alice edits with correct version", e1.status === 200 && e1.data.task.version === 1, e1);
  await sleep(300);
  check("bob sees task:updated live", got(B.seen, "task:updated", (t) => t.id === id && t.title === "Edited by alice"));

  const e2 = await call("PATCH", `/api/tasks/${id}`, tb, { version: 0, title: "Edited by bob" });
  check("bob's stale edit gets 409 with latest task", e2.status === 409 && e2.data.task && e2.data.task.title === "Edited by alice", e2);

  const e3 = await call("PATCH", `/api/tasks/${id}`, tb, { version: 1, title: "Edited by bob" });
  check("bob's edit with fresh version works", e3.status === 200 && e3.data.task.version === 2, e3);

  const mv = await call("POST", `/api/tasks/${id}/move`, ta, { status: "done", position: 500 });
  check("move to another column", mv.status === 200 && mv.data.task.status === "done", mv);
  check("move does not bump content version", mv.data.task.version === 2, mv.data.task);
  await sleep(300);
  check("bob sees task:moved live", got(B.seen, "task:moved", (t) => t.id === id && t.status === "done"));

  const badMove = await call("POST", `/api/tasks/${id}/move`, ta, { status: "nope", position: 1 });
  check("invalid move rejected", badMove.status === 400, badMove);

  A.s.emit("task:editing:start", { taskId: id });
  await sleep(300);
  check("bob sees alice editing", B.seen.editing.some((e) => e.taskId === id && e.username === alice.username), B.seen.editing);

  const list = await call("GET", "/api/tasks", tb);
  check("list contains the task", list.data.tasks.some((t) => t.id === id), list.status);

  const del = await call("DELETE", `/api/tasks/${id}`, ta);
  check("delete task", del.status === 200, del);
  await sleep(300);
  check("bob sees task:deleted live", got(B.seen, "task:deleted", (p) => p.id === id));
  check("editing badge cleared by delete", !B.seen.editing.some((e) => e.taskId === id), B.seen.editing);

  const gone = await call("PATCH", `/api/tasks/${id}`, ta, { version: 2, title: "x" });
  check("editing a deleted task gives 404", gone.status === 404, gone);
  const badId = await call("DELETE", "/api/tasks/not-an-id", ta);
  check("malformed id gives 404, not a crash", badId.status === 404, badId);

  await call("DELETE", `/api/tasks/${c1.data.task.id}`, ta);
  A.s.close();
  await sleep(300);
  check("alice goes offline after closing", !B.seen.presence.some((u) => u.username === alice.username), B.seen.presence);
  B.s.close();

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("Smoke test crashed:", e.message);
  process.exit(1);
});

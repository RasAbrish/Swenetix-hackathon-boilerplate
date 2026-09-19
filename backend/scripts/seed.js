
const BASE = process.env.BASE || "http://localhost:5000";
const creds = { username: "demo", password: "demo1234" };

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const TASKS = [
  ["todo", "Design the landing page", "Hero section, pricing table and a clear call to action."],
  ["todo", "Write API documentation", "Cover auth, tasks and the socket events."],
  ["todo", "Set up error monitoring", ""],
  ["in_progress", "Build drag and drop for the board", "Cards move between columns and keep their order."],
  ["in_progress", "Review pull request #12", "Focus on the concurrency handling."],
  ["done", "Set up MongoDB and the project skeleton", ""],
  ["done", "Add user login", "JWT based, 7 day expiry."],
  ["done", "Real-time updates with Socket.IO", "Presence and live edits work across tabs."],
];

(async () => {
  let res = await call("POST", "/api/auth/login", null, creds);
  if (res.status !== 200) res = await call("POST", "/api/auth/register", null, creds);
  if (!res.data.token) {
    console.error("Could not sign in as demo:", res.status, res.data);
    process.exit(1);
  }
  const token = res.data.token;

  const existing = await call("GET", "/api/tasks", token);
  if (existing.data.tasks && existing.data.tasks.length > 0) {
    console.log(`Board already has ${existing.data.tasks.length} tasks, not adding more.`);
    console.log("Sign in as demo / demo1234.");
    return;
  }

  for (const [status, title, description] of TASKS) {
    const created = await call("POST", "/api/tasks", token, { title, status });
    if (description) {
      await call("PATCH", `/api/tasks/${created.data.task.id}`, token, {
        version: created.data.task.version,
        description,
      });
    }
  }
  console.log(`Added ${TASKS.length} demo tasks. Sign in as demo / demo1234.`);
})().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});

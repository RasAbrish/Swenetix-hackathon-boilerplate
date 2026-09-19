# Task Board Backend (TypeScript)

Express + Mongoose + Socket.IO API for the real-time collaborative task board.

## Getting started

```bash
npm install          # or: yarn
cp .env.example .env # then set JWT_SECRET
npm run dev
```

Needs a running MongoDB (default `mongodb://127.0.0.1:27017/taskboard`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with auto-reload (first start can take 10 to 20s while TypeScript compiles) |
| `npm run seed` | Adds demo tasks and a `demo` / `demo1234` user through the API |
| `npm run smoke` | End-to-end check of the running API (auth, CRUD, conflicts, live events, presence) |
| `npm run build` then `npm start` | Production build and run |V

## REST API

All `/api/tasks` routes need `Authorization: Bearer <token>`.

| Method | Route                  | Description                                              |
|--------|------------------------|----------------------------------------------------------|
| POST   | `/api/auth/register`   | `{ username, password }` returns `{ token, user }`       |
| POST   | `/api/auth/login`      | `{ username, password }` returns `{ token, user }`       |
| GET    | `/api/auth/me`         | Verify a stored token                                    |
| GET    | `/api/tasks`           | All tasks                                                |
| POST   | `/api/tasks`           | `{ title, status?, description?, position?, clientId? }`. Repeating a `clientId` returns the existing task |
| PATCH  | `/api/tasks/:id`       | `{ version, title?, description? }`, 409 on conflict     |
| POST   | `/api/tasks/:id/move`  | `{ status, position }`                                   |
| DELETE | `/api/tasks/:id`       | Delete                                                   |

## Socket.IO events

Connect with `io(url, { auth: { token } })`.

Server to client: `task:created`, `task:updated`, `task:moved`, `task:deleted`,
`presence:update` (who is online), `editing:update` (who is editing which task).

Client to server: `task:editing:start`, `task:editing:stop` (payload `{ taskId }`).

## How concurrency is handled

- **Content edits** carry the `version` the client last saw. The update only applies when the
  version still matches (`findOneAndUpdate({ _id, version })`), otherwise the server returns 409
  with the latest task and nothing is overwritten.
- **Moves** only write `status` and `position`, so dragging never clobbers someone's text edit.
  `position` is fractional (midpoint between neighbours), so a move rewrites a single document.
- **Editing indicators** are in memory and expire after 30s unless refreshed, and are cleared on
  disconnect, so a closed tab can never leave a task stuck as "being edited".

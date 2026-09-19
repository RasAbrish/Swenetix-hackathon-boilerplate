import { useState } from "react";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import { logout } from "./features/auth/authSlice";
import { useRealtime } from "./features/realtime/useRealtime";
import AuthForm from "./components/AuthForm";
import Board from "./components/Board";
import PresenceBar from "./components/PresenceBar";
import SyncStatus from "./components/SyncStatus";
import TaskModal from "./components/TaskModal";

function BoardPage() {
  const dispatch = useAppDispatch();
  const { user, token } = useAppSelector((s) => s.auth);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  useRealtime(token);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Task Board</h1>
        <PresenceBar />
        <div className="user">
          <span>{user?.username}</span>
          <button className="secondary" onClick={() => dispatch(logout())}>
            Log out
          </button>
        </div>
      </header>

      <SyncStatus />

      <Board onOpen={setOpenTaskId} />

      {openTaskId && <TaskModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}

function App() {
  const { user, status } = useAppSelector((s) => s.auth);

  if (status === "checking") {
    return <div className="center muted">Loading...</div>;
  }
  return user ? <BoardPage /> : <AuthForm />;
}

export default App;

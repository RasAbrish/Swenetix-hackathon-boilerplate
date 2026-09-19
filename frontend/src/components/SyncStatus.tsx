import { useAppDispatch, useAppSelector } from "../app/hooks";
import { noticeSet } from "../features/tasks/tasksSlice";
import { keepMineForConflict, keepTheirsForConflict } from "../features/tasks/tasksThunks";
import { useOnlineStatus } from "../lib/useOnlineStatus";

export default function SyncStatus() {
  const dispatch = useAppDispatch();
  const online = useOnlineStatus();
  const connected = useAppSelector((s) => s.presence.connected);
  const { pending, conflicts, notice } = useAppSelector((s) => s.tasks);

  const offline = !online || (!connected && pending > 0);
  const syncing = !offline && pending > 0;

  if (!offline && !syncing && !notice && conflicts.length === 0) return null;

  return (
    <div className="sync-area">
      {offline && (
        <div className="sync-banner offline">
          You are offline. Your changes are saved on this device and will sync when you reconnect
          {pending > 0 ? ` (${pending} waiting).` : "."}
        </div>
      )}
      {syncing && <div className="sync-banner syncing">Syncing {pending} change{pending === 1 ? "" : "s"}...</div>}

      {notice && (
        <div className="sync-banner notice">
          <span>{notice}</span>
          <button className="icon" aria-label="Dismiss" onClick={() => dispatch(noticeSet(null))}>
            &times;
          </button>
        </div>
      )}

      {conflicts.map((c) => (
        <div className="conflict-card" key={c.id}>
          <div>
            <strong>{c.theirs.updatedBy}</strong> changed this task while you were offline.
          </div>
          <div className="conflict-versions">
            <div>
              <span className="muted small">Yours</span>
              <div>{c.mine.title}</div>
            </div>
            <div>
              <span className="muted small">Theirs</span>
              <div>{c.theirs.title}</div>
            </div>
          </div>
          <div className="banner-actions">
            <button type="button" className="secondary" onClick={() => dispatch(keepTheirsForConflict(c))}>
              Keep theirs
            </button>
            <button type="button" onClick={() => dispatch(keepMineForConflict(c))}>
              Overwrite with mine
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

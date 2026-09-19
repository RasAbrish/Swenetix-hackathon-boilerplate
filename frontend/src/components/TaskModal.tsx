import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { taskUpserted } from "../features/tasks/tasksSlice";
import { updateTask } from "../features/tasks/tasksThunks";
import { emitEditingStart, emitEditingStop } from "../lib/socket";

interface Props {
  taskId: string;
  onClose: () => void;
}

export default function TaskModal({ taskId, onClose }: Props) {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const live = useAppSelector((s) => s.tasks.items.find((t) => t.id === taskId));
  const editing = useAppSelector((s) => s.presence.editing);

  const [title, setTitle] = useState(live?.title ?? "");
  const [description, setDescription] = useState(live?.description ?? "");
  const [baseVersion, setBaseVersion] = useState(live?.version ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    emitEditingStart(taskId);
    const timer = setInterval(() => emitEditingStart(taskId), 10_000);
    return () => {
      clearInterval(timer);
      emitEditingStop(taskId);
    };
  }, [taskId]);

  const otherEditor = editing.find((e) => e.taskId === taskId && e.userId !== me?.id);
  const changedRemotely = !!live && live.version > baseVersion;

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await dispatch(updateTask({ id: taskId, version: baseVersion, title, description }));
    setSaving(false);

    if (result.ok) {
      onClose();
      return;
    }
    if (result.conflict) {
      dispatch(taskUpserted(result.conflict));
    } else {
      setError(result.message);
    }
  };

  const useTheirs = () => {
    if (!live) return;
    setTitle(live.title);
    setDescription(live.description);
    setBaseVersion(live.version);
    setError(null);
  };

  const keepMine = () => {
    if (live) setBaseVersion(live.version);
  };

  if (!live) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>This task was deleted</h3>
          <p className="muted">Someone removed it while you had it open.</p>
          <div className="modal-actions">
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit task</h3>

        {otherEditor && (
          <div className="banner warn">{otherEditor.username} is editing this task right now.</div>
        )}

        {changedRemotely && (
          <div className="banner conflict">
            <strong>{live.updatedBy}</strong> saved changes to this task after you opened it.
            <div className="banner-actions">
              <button type="button" onClick={useTheirs}>
                Load their version
              </button>
              <button type="button" className="secondary" onClick={keepMine}>
                Keep mine
              </button>
            </div>
          </div>
        )}

        <label>
          Title
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          Description
          <textarea
            value={description}
            rows={6}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving || changedRemotely}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        {changedRemotely && (
          <p className="muted small">Choose one of the options above before saving.</p>
        )}
      </div>
    </div>
  );
}

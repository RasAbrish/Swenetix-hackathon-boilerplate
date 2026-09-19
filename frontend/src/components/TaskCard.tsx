import { DragEvent } from "react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { deleteTask } from "../features/tasks/tasksThunks";
import { isTempId } from "../lib/outbox";
import type { Task } from "../types";

interface Props {
  task: Task;
  isDragging: boolean;
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

export default function TaskCard({ task, isDragging, onOpen, onDragStart, onDragEnd }: Props) {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const editor = useAppSelector((s) => s.presence.editing.find((e) => e.taskId === task.id));
  const someoneElseEditing = editor && editor.userId !== me?.id;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    onDragStart(task.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${task.title}" for everyone?`)) {
      dispatch(deleteTask(task.id));
    }
  };

  return (
    <div
      className={`card${isDragging ? " dragging" : ""}${someoneElseEditing ? " being-edited" : ""}`}
      data-task-id={task.id}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task.id)}
    >
      <div className="card-top">
        <div className="card-title">{task.title}</div>
        <button className="icon" title="Delete task" onClick={handleDelete}>
          &times;
        </button>
      </div>
      {task.description && <div className="card-desc">{task.description}</div>}
      <div className="card-meta">
        <span>by {task.createdBy}</span>
        {isTempId(task.id) && <span className="unsynced-badge">Not synced yet</span>}
        {someoneElseEditing && <span className="editing-badge">{editor!.username} is editing</span>}
      </div>
    </div>
  );
}

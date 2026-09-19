import { DragEvent, FormEvent, useRef, useState } from "react";
import { useAppDispatch } from "../app/hooks";
import { createTask, moveTask } from "../features/tasks/tasksThunks";
import { computePosition } from "../lib/position";
import type { Task, TaskStatus } from "../types";
import TaskCard from "./TaskCard";

interface Props {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  draggingId: string | null;
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

export default function Column({
  status,
  label,
  tasks,
  draggingId,
  onOpen,
  onDragStart,
  onDragEnd,
}: Props) {
  const dispatch = useAppDispatch();
  const listRef = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState("");

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!over) setOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    if (!id) return;

    // Work out where in the column the card was dropped from the pointer position
    const others = tasks.filter((t) => t.id !== id);
    const cards = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-task-id]") ?? []
    ).filter((el) => el.dataset.taskId !== id);
    let index = cards.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2;
    });
    if (index === -1) index = others.length;

    // Dropped back where it already was
    const current = tasks.findIndex((t) => t.id === id);
    if (current === index && current !== -1) return;

    dispatch(moveTask({ id, status, position: computePosition(others, index) }));
  };

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    dispatch(createTask({ title: trimmed, status }));
    setTitle("");
  };

  return (
    <section
      className={`column${over ? " over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="column-header">
        <h2>{label}</h2>
        <span className="count">{tasks.length}</span>
      </header>

      <div className="column-list" ref={listRef}>
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isDragging={draggingId === task.id}
            onOpen={onOpen}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {tasks.length === 0 && <div className="empty">Drop tasks here</div>}
      </div>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          placeholder="+ Add a task"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
      </form>
    </section>
  );
}

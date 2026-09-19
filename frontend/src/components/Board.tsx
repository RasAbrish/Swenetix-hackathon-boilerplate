import { useState } from "react";
import { useAppSelector } from "../app/hooks";
import { selectTasksByStatus } from "../features/tasks/tasksSlice";
import { COLUMNS } from "../types";
import Column from "./Column";

export default function Board({ onOpen }: { onOpen: (id: string) => void }) {
  const columns = useAppSelector(selectTasksByStatus);
  const { status, error } = useAppSelector((s) => s.tasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  if (status === "loading" || status === "idle") {
    return <div className="center muted">Loading board...</div>;
  }
  if (status === "error") {
    return <div className="center error">{error}</div>;
  }

  return (
    <div className="board">
      {COLUMNS.map((col) => (
        <Column
          key={col.id}
          status={col.id}
          label={col.label}
          tasks={columns[col.id]}
          draggingId={draggingId}
          onOpen={onOpen}
          onDragStart={setDraggingId}
          onDragEnd={() => setDraggingId(null)}
        />
      ))}
    </div>
  );
}

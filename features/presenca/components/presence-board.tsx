"use client";

import { useActionState } from "react";
import { recordAttendance, type AttendanceState } from "../actions";

type Child = { id: string; full_name: string };

const initial: AttendanceState = {};

export function PresenceBoard({
  classId,
  students,
  status,
}: {
  classId: string;
  students: Child[];
  status: Record<string, "present" | "absent">;
}) {
  if (students.length === 0) {
    return (
      <p className="text-muted text-sm">
        Nenhuma criança matriculada nesta turma ainda.
      </p>
    );
  }
  const presentCount = students.filter(
    (s) => status[s.id] === "present",
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted text-sm">
        {presentCount} de {students.length} presente(s) agora.
      </p>
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {students.map((s) => (
          <PresenceRow
            key={s.id}
            classId={classId}
            child={s}
            present={status[s.id] === "present"}
          />
        ))}
      </ul>
    </div>
  );
}

function PresenceRow({
  classId,
  child,
  present,
}: {
  classId: string;
  child: Child;
  present: boolean;
}) {
  const [state, action, pending] = useActionState(recordAttendance, initial);
  const kind = present ? "checkout" : "checkin";

  return (
    <li className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="childId" value={child.id} />
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="kind" value={kind} />

        <span className="text-foreground min-w-0 flex-1 text-sm">
          {child.full_name}
        </span>
        <span
          className={[
            "rounded-full px-2 py-0.5 text-xs font-medium",
            present ? "bg-brand-soft text-brand" : "bg-background text-muted",
          ].join(" ")}
        >
          {present ? "Presente" : "Ausente"}
        </span>
        <input
          name="counterpartName"
          type="text"
          placeholder={present ? "Quem retirou" : "Quem entregou"}
          className="border-border bg-surface text-foreground min-h-[var(--touch-min)] w-36 rounded-[var(--radius-lg)] border px-3 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className={[
            "inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-3 text-sm font-medium disabled:opacity-60",
            present
              ? "border-border text-foreground border"
              : "bg-brand text-brand-foreground",
          ].join(" ")}
        >
          {pending ? "…" : present ? "Registrar saída" : "Registrar entrada"}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="text-critical text-xs">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { EntryComposer } from "./entry-composer";

type Child = { id: string; full_name: string };

export function ClassBoard({
  classId,
  students,
}: {
  classId: string;
  students: Child[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(students.map((s) => s.id)),
  );

  const allSelected = selected.size === students.length && students.length > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="border-border bg-surface rounded-[var(--radius-lg)] border p-5">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h2 className="text-foreground text-base font-semibold">
            Registrar no diário
          </h2>
          <span className="text-muted text-sm">
            {selected.size} de {students.length} selecionada(s)
          </span>
        </div>
        <EntryComposer childIds={[...selected]} classId={classId} />
      </section>

      <section className="border-border bg-surface rounded-[var(--radius-lg)] border p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-foreground text-base font-semibold">Crianças</h2>
          <button
            type="button"
            onClick={() =>
              setSelected(
                allSelected ? new Set() : new Set(students.map((s) => s.id)),
              )
            }
            className="text-brand min-h-[var(--touch-min)] text-sm font-medium"
          >
            {allSelected ? "Limpar seleção" : "Selecionar todas"}
          </button>
        </div>

        {students.length === 0 ? (
          <p className="text-muted text-sm">
            Nenhuma criança matriculada nesta turma ainda.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {students.map((s) => {
              const checked = selected.has(s.id);
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <label className="flex min-h-[var(--touch-min)] flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      className="size-5"
                    />
                    <span className="text-foreground text-sm">
                      {s.full_name}
                    </span>
                  </label>
                  <Link
                    href={`/crianca/${s.id}`}
                    className="text-brand inline-flex min-h-[var(--touch-min)] items-center text-sm font-medium"
                  >
                    Ver diário
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

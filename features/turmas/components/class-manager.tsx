"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createClass, enrollChildren, type ClassState } from "../actions";

type Klass = { id: string; name: string; age_group?: string | null };
type Child = { id: string; full_name: string };

const initial: ClassState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";
const labelClass = "text-foreground text-sm font-medium";
const primaryBtn =
  "bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60";

export function ClassManager({
  classes,
  students,
  enrolledByClass,
}: {
  classes: Klass[];
  students: Child[];
  enrolledByClass: Record<string, string[]>;
}) {
  const [createState, createAction, creating] = useActionState(
    createClass,
    initial,
  );
  const [enrollState, enrollAction, enrolling] = useActionState(
    enrollChildren,
    initial,
  );

  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const enrolled = new Set(enrolledByClass[classId] ?? []);
  const available = students.filter((s) => !enrolled.has(s.id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Criar turma */}
      <form action={createAction} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="class-name" className={labelClass}>
              Nome da turma
            </label>
            <input
              id="class-name"
              name="name"
              type="text"
              placeholder="ex.: Berçário I"
              required
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="class-age" className={labelClass}>
              Faixa etária (opcional)
            </label>
            <input
              id="class-age"
              name="ageGroup"
              type="text"
              placeholder="ex.: 0–1 ano"
              className={fieldClass}
            />
          </div>
        </div>
        {createState.error ? (
          <p role="alert" className="text-critical text-sm">
            {createState.error}
          </p>
        ) : null}
        {createState.message ? (
          <p role="status" className="text-brand text-sm font-medium">
            {createState.message}
          </p>
        ) : null}
        <button type="submit" disabled={creating} className={primaryBtn}>
          {creating ? "Criando…" : "Criar turma"}
        </button>
      </form>

      {/* Matricular crianças */}
      {classes.length === 0 ? (
        <p className="text-muted text-sm">
          Crie uma turma acima para começar a matricular.
        </p>
      ) : (
        <form
          action={enrollAction}
          className="border-border flex flex-col gap-4 border-t pt-6"
          noValidate
        >
          <h3 className="text-foreground text-sm font-semibold">
            Matricular crianças
          </h3>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="enroll-class" className={labelClass}>
              Turma
            </label>
            <select
              id="enroll-class"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setPicked(new Set());
              }}
              className={fieldClass}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.age_group ? ` · ${c.age_group}` : ""}
                </option>
              ))}
            </select>
          </div>

          <input type="hidden" name="classId" value={classId} />
          <input type="hidden" name="childIds" value={[...picked].join(",")} />

          {enrolled.size > 0 ? (
            <p className="text-muted text-sm">
              Já na turma:{" "}
              {students
                .filter((s) => enrolled.has(s.id))
                .map((s) => s.full_name)
                .join(", ")}
              .
            </p>
          ) : null}

          {available.length === 0 ? (
            <p className="text-muted text-sm">
              Todas as crianças cadastradas já estão nesta turma.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {available.map((s) => (
                <li key={s.id}>
                  <label className="flex min-h-[var(--touch-min)] items-center gap-3">
                    <input
                      type="checkbox"
                      checked={picked.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="size-5"
                    />
                    <span className="text-foreground text-sm">
                      {s.full_name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {enrollState.error ? (
            <p role="alert" className="text-critical text-sm">
              {enrollState.error}
            </p>
          ) : null}
          {enrollState.message ? (
            <p role="status" className="text-brand text-sm font-medium">
              {enrollState.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={enrolling || picked.size === 0}
              className={primaryBtn}
            >
              {enrolling
                ? "Matriculando…"
                : `Matricular ${picked.size || ""}`.trim()}
            </button>
            {classId ? (
              <Link
                href={`/turma/${classId}`}
                className="text-brand inline-flex min-h-[var(--touch-min)] items-center text-sm font-medium"
              >
                Abrir painel da turma →
              </Link>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

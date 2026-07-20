"use client";

import { useActionState } from "react";
import { createCommunication, type CommState } from "../actions";

const initial: CommState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";
const labelClass = "text-foreground text-sm font-medium";

export function CommForm({
  canPostSchoolWide,
  classes,
}: {
  canPostSchoolWide: boolean;
  classes: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createCommunication, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-title" className={labelClass}>
          Título
        </label>
        <input
          id="c-title"
          name="title"
          type="text"
          required
          placeholder="ex.: Reunião de pais"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-body" className={labelClass}>
          Mensagem
        </label>
        <textarea
          id="c-body"
          name="body"
          rows={3}
          required
          className={fieldClass + " py-2"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-scope" className={labelClass}>
            Alcance
          </label>
          <select
            id="c-scope"
            name="classId"
            defaultValue={canPostSchoolWide ? "" : (classes[0]?.id ?? "")}
            className={fieldClass}
          >
            {canPostSchoolWide ? (
              <option value="">Escola inteira</option>
            ) : null}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-priority" className={labelClass}>
            Prioridade
          </label>
          <select
            id="c-priority"
            name="priority"
            defaultValue="normal"
            className={fieldClass}
          >
            <option value="normal">Normal</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
      </div>

      <label className="text-foreground flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requiresAck"
          defaultChecked
          className="size-4"
        />
        Pedir confirmação de leitura (Ciente)
      </label>

      {state.error ? (
        <p role="alert" className="text-critical text-sm">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-brand text-sm font-medium">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-brand-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Publicando…" : "Publicar comunicado"}
      </button>
    </form>
  );
}

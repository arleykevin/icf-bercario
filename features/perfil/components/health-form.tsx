"use client";

import { useActionState } from "react";
import { upsertHealth, type PerfilState } from "../actions";

export type HealthInitial = {
  blood_type: string | null;
  allergies: string | null;
  dietary_restrictions: string | null;
  medical_notes: string | null;
} | null;

const initial: PerfilState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";
const labelClass = "text-foreground text-sm font-medium";

export function HealthForm({
  childId,
  data,
}: {
  childId: string;
  data: HealthInitial;
}) {
  const [state, action, pending] = useActionState(upsertHealth, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="childId" value={childId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="h-blood" className={labelClass}>
          Tipo sanguíneo
        </label>
        <input
          id="h-blood"
          name="bloodType"
          type="text"
          defaultValue={data?.blood_type ?? ""}
          placeholder="ex.: O+"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="h-allergies" className={labelClass}>
          Alergias
        </label>
        <textarea
          id="h-allergies"
          name="allergies"
          rows={2}
          defaultValue={data?.allergies ?? ""}
          placeholder="ex.: amendoim, lactose…"
          className={fieldClass + " py-2"}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="h-diet" className={labelClass}>
          Restrições alimentares
        </label>
        <textarea
          id="h-diet"
          name="dietaryRestrictions"
          rows={2}
          defaultValue={data?.dietary_restrictions ?? ""}
          className={fieldClass + " py-2"}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="h-notes" className={labelClass}>
          Observações médicas
        </label>
        <textarea
          id="h-notes"
          name="medicalNotes"
          rows={3}
          defaultValue={data?.medical_notes ?? ""}
          className={fieldClass + " py-2"}
        />
      </div>

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
        {pending ? "Salvando…" : "Salvar ficha de saúde"}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { authorizeMedication, type MedState } from "../actions";

const initial: MedState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";
const labelClass = "text-foreground text-sm font-medium";

export function AuthorizeForm({ childId }: { childId: string }) {
  const [state, action, pending] = useActionState(authorizeMedication, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="childId" value={childId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="med-name" className={labelClass}>
            Medicamento
          </label>
          <input
            id="med-name"
            name="medicationName"
            type="text"
            required
            placeholder="ex.: Dipirona"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="med-dose" className={labelClass}>
            Dose
          </label>
          <input
            id="med-dose"
            name="dosage"
            type="text"
            required
            placeholder="ex.: 10 gotas"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="med-route" className={labelClass}>
            Via (opcional)
          </label>
          <input
            id="med-route"
            name="route"
            type="text"
            placeholder="oral, tópica…"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="med-from" className={labelClass}>
            Válida de (opcional)
          </label>
          <input
            id="med-from"
            name="validFrom"
            type="date"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="med-until" className={labelClass}>
            Válida até
          </label>
          <input
            id="med-until"
            name="validUntil"
            type="date"
            required
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="med-instructions" className={labelClass}>
          Instruções (opcional)
        </label>
        <textarea
          id="med-instructions"
          name="instructions"
          rows={2}
          placeholder="ex.: a cada 8h se febre acima de 37,8°C"
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
        {pending ? "Autorizando…" : "Autorizar medicamento"}
      </button>
      <p className="text-muted text-xs">
        Ao autorizar, fica registrada sua identidade, data/hora e uma assinatura
        (hash) — registro imutável.
      </p>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { bulkImportChildren, type ImportState } from "../actions";

const initial: ImportState = {};

export function ImportForm() {
  const [state, action, pending] = useActionState(bulkImportChildren, initial);

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="csv" className="text-foreground text-sm font-medium">
          Importar crianças (CSV)
        </label>
        <p className="text-muted text-xs">
          Uma por linha: <code>Nome Completo, AAAA-MM-DD</code> (ou DD/MM/AAAA).
        </p>
        <textarea
          id="csv"
          name="csv"
          rows={6}
          required
          placeholder={"Maria Silva, 2024-03-10\nJoão Souza, 15/06/2024"}
          className="border-border bg-surface text-foreground focus-visible:ring-ring w-full rounded-[var(--radius-lg)] border p-3 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
          aria-describedby="import-status"
        />
      </div>

      <p
        id="import-status"
        role="status"
        aria-live="polite"
        className="text-sm"
      >
        {state.error ? (
          <span className="text-critical">{state.error}</span>
        ) : state.message ? (
          <span className="text-brand">{state.message}</span>
        ) : null}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="border-border text-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] border px-5 font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Importando…" : "Importar"}
      </button>
    </form>
  );
}

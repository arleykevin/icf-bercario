"use client";

import { useActionState } from "react";
import { createSchool, type OnboardingState } from "../actions";

const initial: OnboardingState = {};

export function SchoolForm() {
  const [state, action, pending] = useActionState(createSchool, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-foreground text-sm font-medium">
          Nome da escola
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="organization"
          className="border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none"
          aria-describedby={state.error ? "school-error" : undefined}
        />
      </div>

      {state.error ? (
        <p id="school-error" role="alert" className="text-critical text-sm">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-brand-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Criando…" : "Criar escola"}
      </button>
    </form>
  );
}

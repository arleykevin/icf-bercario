"use client";

import { useActionState } from "react";
import {
  signInWithPassword,
  signInWithMagicLink,
  type AuthState,
} from "../actions";

const initialState: AuthState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";
const buttonClass =
  "bg-brand text-brand-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] w-full items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

export function LoginForm() {
  const [pwState, pwAction, pwPending] = useActionState(
    signInWithPassword,
    initialState,
  );
  const [mlState, mlAction, mlPending] = useActionState(
    signInWithMagicLink,
    initialState,
  );

  return (
    <div className="flex flex-col gap-8">
      <form action={pwAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-foreground text-sm font-medium"
          >
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClass}
            aria-describedby={pwState.error ? "pw-error" : undefined}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-foreground text-sm font-medium"
          >
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={fieldClass}
            aria-describedby={pwState.error ? "pw-error" : undefined}
          />
        </div>

        {pwState.error ? (
          <p id="pw-error" role="alert" className="text-critical text-sm">
            {pwState.error}
          </p>
        ) : null}

        <button type="submit" className={buttonClass} disabled={pwPending}>
          {pwPending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted text-xs">ou</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <form action={mlAction} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="magic-email"
            className="text-foreground text-sm font-medium"
          >
            Receber link de acesso por e-mail
          </label>
          <input
            id="magic-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClass}
            aria-describedby={
              mlState.error || mlState.message ? "ml-status" : undefined
            }
          />
        </div>

        {mlState.error || mlState.message ? (
          <p
            id="ml-status"
            role="status"
            className={
              mlState.error ? "text-critical text-sm" : "text-brand text-sm"
            }
          >
            {mlState.error ?? mlState.message}
          </p>
        ) : null}

        <button
          type="submit"
          className="border-border text-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] w-full items-center justify-center rounded-[var(--radius-lg)] border px-5 font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
          disabled={mlPending}
        >
          {mlPending ? "Enviando…" : "Enviar link mágico"}
        </button>
      </form>
    </div>
  );
}

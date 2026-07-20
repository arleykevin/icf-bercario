"use client";

import { useState, useTransition } from "react";
import { clearPin, setPin, type PinState } from "../actions";

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 text-center tracking-[0.4em] focus-visible:ring-2 focus-visible:outline-none";

/**
 * Configuração do PIN de bloqueio do tablet (para equipe). Define/troca/remove o
 * PIN do próprio usuário. Com PIN, o tablet trava sozinho quando ocioso e retoma
 * com o PIN; sem PIN, só há o auto-logout.
 */
export function PinSetup({ hasPin: initialHasPin }: { hasPin: boolean }) {
  const [state, setState] = useState<PinState>({});
  const [hasPin, setHasPin] = useState(initialHasPin);
  const [pending, startSet] = useTransition();
  const [clearing, startClear] = useTransition();

  // Client actions: todo setState acontece no callback da transition (não em effect).
  function onSubmit(formData: FormData) {
    startSet(async () => {
      const res = await setPin({}, formData);
      setState(res);
      if (res.message) setHasPin(true);
    });
  }

  function onClear() {
    startClear(async () => {
      const res = await clearPin();
      setState(res);
      if (!res.error) setHasPin(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">
        {hasPin
          ? "Você tem um PIN configurado. O tablet trava sozinho quando fica ocioso e você retoma com o PIN."
          : "Defina um PIN de 4 a 8 dígitos para travar o tablet rapidamente entre um registro e outro."}
      </p>

      <form action={onSubmit} className="flex max-w-xs flex-col gap-3">
        <label htmlFor="pin" className="text-foreground text-sm font-medium">
          {hasPin ? "Novo PIN" : "PIN"}
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          minLength={4}
          maxLength={8}
          placeholder="••••"
          className={fieldClass}
        />
        <label
          htmlFor="confirm"
          className="text-foreground text-sm font-medium"
        >
          Confirmar PIN
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          minLength={4}
          maxLength={8}
          placeholder="••••"
          className={fieldClass}
        />

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

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium disabled:opacity-60"
          >
            {pending ? "Salvando…" : hasPin ? "Trocar PIN" : "Salvar PIN"}
          </button>
          {hasPin ? (
            <button
              type="button"
              onClick={onClear}
              disabled={clearing}
              className="border-border text-foreground inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--radius-lg)] border px-4 text-sm font-medium disabled:opacity-60"
            >
              {clearing ? "Removendo…" : "Remover PIN"}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

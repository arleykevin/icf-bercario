"use client";

import { useState, useTransition } from "react";
import { signOut } from "@/features/auth/actions";
import { verifyPin } from "../actions";

const MAX_ATTEMPTS = 5;

/**
 * Overlay de bloqueio do tablet. O mesmo usuário logado retoma com o PIN. Após
 * MAX_ATTEMPTS erros na tela, encerra a sessão — mas isso é só UX: o limite REAL
 * de força-bruta é o rate limit server-side em verifyPin (o overlay é DOM cliente
 * e o cookie de sessão segue válido enquanto travado).
 */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const ok = await verifyPin(pin);
      if (ok) {
        onUnlock();
        return;
      }
      const next = attempts + 1;
      setAttempts(next);
      setPin("");
      if (next >= MAX_ATTEMPTS) {
        void signOut();
        return;
      }
      setError(`PIN incorreto. Tentativa ${next} de ${MAX_ATTEMPTS}.`);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tela bloqueada"
      className="bg-surface fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 px-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden className="text-4xl">
          🔒
        </span>
        <h2 className="text-foreground text-xl font-semibold">
          Tela bloqueada
        </h2>
        <p className="text-muted text-sm">Digite seu PIN para continuar.</p>
      </div>

      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-4">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-label="PIN"
          value={pin}
          onChange={(e) =>
            setPin(e.target.value.replace(/\D/g, "").slice(0, 8))
          }
          className="border-border bg-surface text-foreground min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 text-center text-2xl tracking-[0.5em]"
        />
        {error ? (
          <p role="alert" className="text-critical text-center text-sm">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || pin.length < 4}
          className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium disabled:opacity-60"
        >
          {pending ? "Verificando…" : "Desbloquear"}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-muted min-h-[var(--touch-min)] text-sm"
        >
          Sair da conta
        </button>
      </form>
    </div>
  );
}

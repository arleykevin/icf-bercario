"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { LockScreen } from "./lock-screen";

// Tablet compartilhado de sala (PLANO.md §9 risco #10): trava a tela após um
// tempo ocioso (se houver PIN) e ENCERRA a sessão após um tempo maior.
const LOCK_MS = 3 * 60 * 1000; // 3 min → bloqueia (se houver PIN)
const LOGOUT_MS = 15 * 60 * 1000; // 15 min → encerra a sessão
const CHECK_MS = 15 * 1000;

/**
 * Envolve o conteúdo autenticado e cuida da sessão do tablet:
 *  - trava a tela com PIN após inatividade (se houver PIN);
 *  - encerra a sessão após inatividade maior — de forma OFFLINE-SAFE: limpa a
 *    sessão local (cookies) sem depender do servidor e cobre o conteúdo com um
 *    overlay bloqueante, para o tablet não ficar exposto mesmo sem rede.
 *
 * Enquanto bloqueado/encerrado, o conteúdo de fundo recebe `inert` — some do foco,
 * do teclado e da árvore de acessibilidade, fechando o escape por Tab para ações
 * sensíveis atrás do overlay (o cookie de sessão ainda é válido durante a trava).
 */
export function SessionShell({
  hasPin,
  children,
}: {
  hasPin: boolean;
  children: React.ReactNode;
}) {
  const [locked, setLocked] = useState(false);
  const [ended, setEnded] = useState(false);
  const lastActivityRef = useRef(0);
  const lockedRef = useRef(false);
  const endedRef = useRef(false);

  async function endSession() {
    try {
      // signOut do client de browser limpa a sessão LOCAL (cookies) primeiro e
      // tenta revogar no servidor — offline, a limpeza local ainda acontece.
      await createClient().auth.signOut();
    } catch {
      // sem rede: o overlay bloqueante já cobre o conteúdo.
    }
    try {
      window.location.assign("/login");
    } catch {
      // noop
    }
  }

  useEffect(() => {
    lastActivityRef.current = Date.now();

    const markActive = () => {
      if (!lockedRef.current && !endedRef.current) {
        lastActivityRef.current = Date.now();
      }
    };
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "keydown",
      "touchstart",
    ];
    events.forEach((e) =>
      window.addEventListener(e, markActive, { passive: true }),
    );

    const interval = window.setInterval(() => {
      if (endedRef.current) return;
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= LOGOUT_MS) {
        endedRef.current = true;
        setEnded(true);
        void endSession();
        return;
      }
      if (!lockedRef.current && hasPin && idle >= LOCK_MS) {
        lockedRef.current = true;
        setLocked(true);
      }
    }, CHECK_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      window.clearInterval(interval);
    };
  }, [hasPin]);

  function handleUnlock() {
    lockedRef.current = false;
    lastActivityRef.current = Date.now();
    setLocked(false);
  }

  const blocked = locked || ended;

  return (
    <>
      <div inert={blocked ? true : undefined}>{children}</div>
      {ended ? (
        <EndedOverlay />
      ) : locked ? (
        <LockScreen onUnlock={handleUnlock} />
      ) : null}
    </>
  );
}

function EndedOverlay() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sessão encerrada"
      className="bg-surface fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <span aria-hidden className="text-4xl">
        🔒
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-xl font-semibold">
          Sessão encerrada
        </h2>
        <p className="text-muted text-sm">
          Encerramos por inatividade para proteger os dados no tablet.
        </p>
      </div>
      <a
        href="/login"
        className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium"
      >
        Entrar novamente
      </a>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Entrar",
};

/**
 * Placeholder de autenticação (Fase 0). A tela real — e-mail/senha + magic link, com
 * consentimento LGPD no fluxo de convite — entra na Fase 1 (ver PLANO.md §8, Fase 1, item 7).
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-foreground text-2xl font-semibold">Entrar</h1>
        <p className="text-muted text-sm">
          A autenticação (e-mail/senha e link mágico) será implementada na Fase
          1.
        </p>
      </div>
      <Link
        href="/"
        className="border-border text-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] border px-5 font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        Voltar ao início
      </Link>
    </main>
  );
}

import Link from "next/link";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/config";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <span className="bg-brand-soft text-brand w-fit rounded-full px-3 py-1 text-sm font-medium">
          Fundação · Fase 0
        </span>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
          {APP_NAME}
        </h1>
        <p className="text-muted text-lg leading-relaxed">{APP_DESCRIPTION}</p>
      </header>

      <section
        aria-labelledby="status-heading"
        className="border-border bg-surface rounded-[var(--radius-lg)] border p-6"
      >
        <h2
          id="status-heading"
          className="text-foreground text-base font-semibold"
        >
          Ambiente configurado
        </h2>
        <ul className="text-muted mt-3 space-y-1.5 text-sm">
          <li>✓ Next.js (App Router) + TypeScript + Tailwind</li>
          <li>✓ Supabase (clients server/browser) + middleware de sessão</li>
          <li>✓ RLS deny-by-default nas tabelas base (multi-tenant)</li>
          <li>✓ PWA (Serwist) + observabilidade com scrubbing de PII</li>
        </ul>
        <p className="text-muted mt-4 text-sm">
          Próximo: telas de autenticação e o núcleo do Diário de Bordo (Fase 1).
          Consulte o <code className="text-foreground">PLANO.md</code> para o
          roadmap completo.
        </p>
      </section>

      <nav className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="bg-brand text-brand-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Entrar
        </Link>
        <a
          href="/api/health"
          className="border-border text-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] border px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Status do serviço
        </a>
      </nav>
    </main>
  );
}

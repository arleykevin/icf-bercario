import type { Metadata } from "next";
import { MfaFlow } from "@/features/mfa/components/mfa-flow";

export const metadata: Metadata = {
  title: "Verificação em duas etapas",
};

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Evita open-redirect: só caminhos internos (rejeita "//host" protocolo-relativo).
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-foreground text-2xl font-semibold">
          Verificação em duas etapas
        </h1>
        <p className="text-muted text-sm">
          Uma camada extra de segurança, obrigatória para contas de
          administração.
        </p>
      </header>
      <MfaFlow next={safeNext} />
    </main>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sem conexão",
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-foreground text-2xl font-semibold">
        Você está offline
      </h1>
      <p className="text-muted">
        Sem conexão no momento. Os registros feitos agora ficam salvos no
        dispositivo e são enviados automaticamente assim que a internet voltar.
      </p>
    </main>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OutboxFlusher } from "@/features/diario/components/outbox-flusher";
import { SessionShell } from "@/features/tablet/components/session-shell";

/**
 * Layout da área autenticada. Guard de servidor: sem usuário → /login.
 * (O proxy já redireciona na borda; esta é a segunda barreira, no servidor.)
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Tablet de sala: o SessionGuard trava/encerra a sessão por inatividade.
  const { data: hasPin } = await supabase.rpc("has_my_pin");

  return (
    <div className="min-h-dvh">
      <SessionShell hasPin={hasPin === true}>{children}</SessionShell>
      <OutboxFlusher />
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  return <div className="min-h-dvh">{children}</div>;
}

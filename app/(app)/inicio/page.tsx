import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, isAppRole } from "@/lib/auth/roles";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const metadata: Metadata = {
  title: "Início",
};

export default async function InicioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("org_members")
    .select("role, organization_id")
    .eq("profile_id", user!.id)
    .eq("is_active", true);

  const orgIds = (memberships ?? []).map(
    (m: { organization_id: string }) => m.organization_id,
  );

  let orgNames: Record<string, string> = {};
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    orgNames = Object.fromEntries(
      (orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]),
    );
  }

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "Bem-vindo(a)";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground text-2xl font-semibold">
            Olá, {firstName}
          </h1>
          <p className="text-muted text-sm">
            Área autenticada · Fase 1 em construção
          </p>
        </div>
        <SignOutButton />
      </header>

      <section
        aria-labelledby="vinculos-heading"
        className="border-border bg-surface rounded-[var(--radius-lg)] border p-6"
      >
        <h2
          id="vinculos-heading"
          className="text-foreground text-base font-semibold"
        >
          Seus vínculos
        </h2>
        {memberships && memberships.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {memberships.map(
              (m: { role: string; organization_id: string }, i) => (
                <li
                  key={i}
                  className="text-foreground flex items-center justify-between text-sm"
                >
                  <span>{orgNames[m.organization_id] ?? "Escola"}</span>
                  <span className="bg-brand-soft text-brand rounded-full px-3 py-0.5 text-xs font-medium">
                    {isAppRole(m.role) ? ROLE_LABELS[m.role] : m.role}
                  </span>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="text-muted mt-3 text-sm">
            Nenhum vínculo ativo ainda. A gestão da escola precisa te adicionar
            a uma organização.
          </p>
        )}
      </section>
    </main>
  );
}

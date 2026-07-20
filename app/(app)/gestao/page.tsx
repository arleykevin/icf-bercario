import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "@/features/convites/components/invite-form";
import { ImportForm } from "@/features/onboarding/components/import-form";

export const metadata: Metadata = {
  title: "Gestão",
};

export default async function GestaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: adminOrg } = await supabase
    .from("org_members")
    .select("organization_id")
    .eq("profile_id", user!.id)
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!adminOrg) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-12">
        <h1 className="text-foreground text-2xl font-semibold">Gestão</h1>
        <p className="text-muted text-sm">
          Você ainda não administra nenhuma escola.
        </p>
        <Link
          href="/onboarding"
          className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium"
        >
          Criar escola
        </Link>
      </main>
    );
  }

  const orgId = adminOrg.organization_id as string;

  const { data: students } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("full_name");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-10">
      <h1 className="text-foreground text-2xl font-semibold">
        Gestão da escola
      </h1>

      <section
        aria-labelledby="import-heading"
        className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-lg)] border p-6"
      >
        <h2
          id="import-heading"
          className="text-foreground text-lg font-semibold"
        >
          Cadastrar crianças
        </h2>
        <ImportForm />
      </section>

      <section
        aria-labelledby="invite-heading"
        className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-lg)] border p-6"
      >
        <h2
          id="invite-heading"
          className="text-foreground text-lg font-semibold"
        >
          Convidar equipe e responsáveis
        </h2>
        <InviteForm organizationId={orgId} students={students ?? []} />
      </section>
    </main>
  );
}

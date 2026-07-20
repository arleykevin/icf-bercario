import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EntryComposer } from "@/features/diario/components/entry-composer";
import { Timeline } from "@/features/diario/components/timeline";
import type { DiaryEntryRow } from "@/features/diario/entries";

export const metadata: Metadata = {
  title: "Diário",
};

export default async function CriancaPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const supabase = await createClient();

  // RLS: só admin/professor/responsável da criança conseguem ler.
  const { data: child } = await supabase
    .from("children")
    .select("id, organization_id, full_name")
    .eq("id", childId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!child) notFound();

  const orgId = child.organization_id as string;

  const [{ data: isAdmin }, { data: teaches }, { data: entriesData }] =
    await Promise.all([
      supabase.rpc("is_org_admin", { target_org: orgId }),
      supabase.rpc("teaches_child", { target_child: childId }),
      supabase
        .from("diary_entries")
        .select(
          "id, child_id, entry_type, occurred_at, note, temperature_c, payload, recorded_by",
        )
        .eq("child_id", childId)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(100),
    ]);

  const canWrite = isAdmin === true || teaches === true;
  const entries = (entriesData ?? []) as DiaryEntryRow[];
  const firstName = String(child.full_name).split(" ")[0];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/inicio" className="text-muted w-fit text-sm">
          ← Início
        </Link>
        <h1 className="text-foreground text-2xl font-semibold">
          Diário de {firstName}
        </h1>
        <p className="text-muted text-sm">
          A rotina do dia, com carinho e transparência.
        </p>
      </header>

      {canWrite ? (
        <section className="border-border bg-surface rounded-[var(--radius-lg)] border p-5">
          <h2 className="text-foreground mb-4 text-base font-semibold">
            Registrar
          </h2>
          <EntryComposer childIds={[childId]} />
        </section>
      ) : null}

      <section aria-label="Linha do tempo">
        <Timeline entries={entries} />
      </section>
    </main>
  );
}

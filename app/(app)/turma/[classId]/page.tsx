import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClassBoard } from "@/features/diario/components/class-board";
import { PresenceBoard } from "@/features/presenca/components/presence-board";

export const metadata: Metadata = {
  title: "Turma",
};

export default async function TurmaPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  // A RLS decide o que volta: só admin/professor/responsável da turma leem.
  const { data: klass } = await supabase
    .from("classes")
    .select("id, organization_id, name")
    .eq("id", classId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!klass) notFound();

  const orgId = klass.organization_id as string;

  // O painel é ferramenta de quem registra (admin ou professor da turma).
  const [{ data: isAdmin }, { data: teaches }] = await Promise.all([
    supabase.rpc("is_org_admin", { target_org: orgId }),
    supabase.rpc("teaches_class", { target_class: classId }),
  ]);
  if (isAdmin !== true && teaches !== true) notFound();

  // Roster: crianças com matrícula ativa (2 passos p/ evitar embed tipado).
  const { data: enr } = await supabase
    .from("enrollments")
    .select("child_id")
    .eq("class_id", classId)
    .eq("status", "active")
    .is("deleted_at", null);
  const childIds = (enr ?? []).map((e: { child_id: string }) => e.child_id);

  let students: { id: string; full_name: string }[] = [];
  if (childIds.length > 0) {
    const { data: kids } = await supabase
      .from("children")
      .select("id, full_name")
      .in("id", childIds)
      .is("deleted_at", null)
      .order("full_name");
    students = (kids ?? []) as { id: string; full_name: string }[];
  }

  // Presença de hoje: último evento (últimas 24h) por criança define presente/ausente.
  const presence: Record<string, "present" | "absent"> = {};
  if (childIds.length > 0) {
    const since = new Date(
      new Date().getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: att } = await supabase
      .from("attendance_events")
      .select("child_id, kind, occurred_at")
      .in("child_id", childIds)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false });
    const seen = new Set<string>();
    for (const e of (att ?? []) as { child_id: string; kind: string }[]) {
      if (seen.has(e.child_id)) continue;
      seen.add(e.child_id);
      presence[e.child_id] = e.kind === "checkin" ? "present" : "absent";
    }
    for (const s of students)
      if (!(s.id in presence)) presence[s.id] = "absent";
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/inicio" className="text-muted w-fit text-sm">
          ← Início
        </Link>
        <h1 className="text-foreground text-2xl font-semibold">
          {String(klass.name)}
        </h1>
        <p className="text-muted text-sm">
          Registre a rotina do dia — para uma criança ou várias de uma vez.
        </p>
      </header>

      <section className="border-border bg-surface rounded-[var(--radius-lg)] border p-5">
        <h2 className="text-foreground mb-3 text-base font-semibold">
          Presença
        </h2>
        <PresenceBoard
          classId={classId}
          students={students}
          status={presence}
        />
      </section>

      <ClassBoard classId={classId} students={students} />
    </main>
  );
}

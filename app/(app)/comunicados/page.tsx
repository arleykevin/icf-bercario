import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CommForm } from "@/features/comunicados/components/comm-form";
import {
  CommList,
  type CommRow,
} from "@/features/comunicados/components/comm-list";

export const metadata: Metadata = {
  title: "Comunicados",
};

export default async function ComunicadosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;

  const [{ data: commsData }, { data: myAcks }] = await Promise.all([
    supabase
      .from("communications")
      .select("id, class_id, title, body, priority, requires_ack, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("communication_acks")
      .select("communication_id, acked_at")
      .eq("guardian_id", uid),
  ]);
  const comms = (commsData ?? []) as CommRow[];

  const ackedMap: Record<string, string> = {};
  for (const a of (myAcks ?? []) as {
    communication_id: string;
    acked_at: string;
  }[]) {
    ackedMap[a.communication_id] = a.acked_at;
  }

  // Papéis
  const [{ data: adminOrg }, { data: guards }, { data: taughtLinks }] =
    await Promise.all([
      supabase
        .from("org_members")
        .select("organization_id")
        .eq("profile_id", uid)
        .eq("role", "admin")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("guardianships")
        .select("id")
        .eq("guardian_id", uid)
        .is("deleted_at", null)
        .limit(1),
      supabase
        .from("class_teachers")
        .select("class_id")
        .eq("teacher_id", uid)
        .is("deleted_at", null),
    ]);

  const isAdmin = Boolean(adminOrg);
  const isGuardian = (guards ?? []).length > 0;
  const taughtIds = (taughtLinks ?? []).map(
    (t: { class_id: string }) => t.class_id,
  );
  const canPost = isAdmin || taughtIds.length > 0;

  // Turmas p/ o formulário (as que administro + as que leciono).
  const classMap = new Map<string, string>();
  if (adminOrg) {
    const { data } = await supabase
      .from("classes")
      .select("id, name")
      .eq("organization_id", adminOrg.organization_id as string)
      .is("deleted_at", null)
      .order("name");
    for (const c of (data ?? []) as { id: string; name: string }[])
      classMap.set(c.id, c.name);
  }
  const missingClassIds = [
    ...new Set([
      ...taughtIds,
      ...comms.map((c) => c.class_id).filter((c): c is string => !!c),
    ]),
  ].filter((id) => !classMap.has(id));
  if (missingClassIds.length) {
    const { data } = await supabase
      .from("classes")
      .select("id, name")
      .in("id", missingClassIds);
    for (const c of (data ?? []) as { id: string; name: string }[])
      classMap.set(c.id, c.name);
  }
  const classNames = Object.fromEntries(classMap);
  const formClasses = isAdmin
    ? [...classMap.entries()].map(([id, name]) => ({ id, name }))
    : taughtIds
        .filter((id) => classMap.has(id))
        .map((id) => ({ id, name: classMap.get(id)! }));

  // Contagem de "cientes" p/ a gestão.
  const ackCounts: Record<string, number> = {};
  if (isAdmin) {
    const { data } = await supabase
      .from("communication_acks")
      .select("communication_id");
    for (const a of (data ?? []) as { communication_id: string }[]) {
      ackCounts[a.communication_id] = (ackCounts[a.communication_id] ?? 0) + 1;
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/inicio" className="text-muted w-fit text-sm">
          ← Início
        </Link>
        <h1 className="text-foreground text-2xl font-semibold">Comunicados</h1>
        <p className="text-muted text-sm">
          Avisos da escola e das turmas, com confirmação de leitura.
        </p>
      </header>

      {canPost ? (
        <section className="border-border bg-surface rounded-[var(--radius-lg)] border p-5">
          <details>
            <summary className="text-brand min-h-[var(--touch-min)] cursor-pointer text-sm font-medium">
              Novo comunicado
            </summary>
            <div className="mt-4">
              <CommForm canPostSchoolWide={isAdmin} classes={formClasses} />
            </div>
          </details>
        </section>
      ) : null}

      <section aria-label="Lista de comunicados">
        <CommList
          comms={comms}
          classNames={classNames}
          ackedMap={ackedMap}
          ackCounts={ackCounts}
          isGuardian={isGuardian}
          isAdmin={isAdmin}
        />
      </section>
    </main>
  );
}

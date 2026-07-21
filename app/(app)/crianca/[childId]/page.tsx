import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EntryComposer } from "@/features/diario/components/entry-composer";
import { Timeline } from "@/features/diario/components/timeline";
import type { DiaryEntryRow } from "@/features/diario/entries";
import { AuthorizeForm } from "@/features/medicamentos/components/authorize-form";
import {
  AdministerPanel,
  type MedAuthorization,
} from "@/features/medicamentos/components/administer-panel";
import { summarizeDay } from "@/features/resumo/summarize-day";
import { DaySummary } from "@/features/resumo/components/day-summary";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: isAdmin },
    { data: teaches },
    { data: isLegal },
    { data: isGuard },
    { data: entriesData },
    { data: authData },
  ] = await Promise.all([
    supabase.rpc("is_org_admin", { target_org: orgId }),
    supabase.rpc("teaches_child", { target_child: childId }),
    supabase.rpc("is_legal_guardian_of", { target_child: childId }),
    supabase.rpc("is_guardian_of", { target_child: childId }),
    supabase
      .from("diary_entries")
      .select(
        "id, child_id, entry_type, occurred_at, note, temperature_c, payload, recorded_by, media_path",
      )
      .eq("child_id", childId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase
      .from("medication_authorizations")
      .select(
        "id, medication_name, dosage, route, instructions, valid_from, valid_until",
      )
      .eq("child_id", childId)
      .gte("valid_until", today)
      .order("valid_until", { ascending: false }),
  ]);

  const canWrite = isAdmin === true || teaches === true;
  const isLegalGuardian = isLegal === true;
  const canReact = isGuard === true;
  const entries = (entriesData ?? []) as DiaryEntryRow[];
  const authorizations = (authData ?? []) as MedAuthorization[];
  const firstName = String(child.full_name).split(" ")[0];

  // Reações/comentários dos pais por registro.
  const { data: reactionsData } = await supabase
    .from("diary_reactions")
    .select("id, diary_entry_id, author_id, kind, comment")
    .eq("child_id", childId);
  const reactionRows = (reactionsData ?? []) as {
    id: string;
    diary_entry_id: string;
    author_id: string;
    kind: string;
    comment: string | null;
  }[];
  const commentAuthorIds = [
    ...new Set(
      reactionRows.filter((r) => r.kind === "comment").map((r) => r.author_id),
    ),
  ];
  const authorName: Record<string, string> = {};
  if (commentAuthorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", commentAuthorIds);
    for (const p of (profs ?? []) as { id: string; full_name: string }[]) {
      authorName[p.id] = p.full_name?.split(" ")[0] ?? "Responsável";
    }
  }
  const reactionsByEntry: Record<
    string,
    {
      heartCount: number;
      myHeartId: string | null;
      comments: { id: string; author: string; text: string; mine: boolean }[];
    }
  > = {};
  for (const r of reactionRows) {
    const e = (reactionsByEntry[r.diary_entry_id] ??= {
      heartCount: 0,
      myHeartId: null,
      comments: [],
    });
    if (r.kind === "heart") {
      e.heartCount++;
      if (r.author_id === userId) e.myHeartId = r.id;
    } else if (r.kind === "comment" && r.comment) {
      e.comments.push({
        id: r.id,
        author: authorName[r.author_id] ?? "Responsável",
        text: r.comment,
        mine: r.author_id === userId,
      });
    }
  }

  // Resumo do dia: agrega os eventos de hoje (fuso da escola) num digest.
  const dayKey = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  const todayKey = dayKey(new Date().toISOString());
  const daySummary = summarizeDay(
    entries.filter((e) => dayKey(e.occurred_at) === todayKey),
  );

  // Fotos: signed URLs de curta duração (10 min) — bucket é privado. Usa o client
  // COM RLS (nunca service_role): o Storage re-autoriza cada caminho por child_media_select,
  // então um media_path forjado não assina/baixa foto de terceiro.
  const paths = entries
    .map((e) => e.media_path)
    .filter((p): p is string => Boolean(p));
  const mediaUrls: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("child-media")
      .createSignedUrls(paths, 600);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) mediaUrls[s.path] = s.signedUrl;
    }
  }

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
        <Link
          href={`/crianca/${childId}/perfil`}
          className="text-brand mt-1 w-fit text-sm font-medium"
        >
          Ver perfil (saúde, autorizados) →
        </Link>
      </header>

      <DaySummary summary={daySummary} childFirstName={firstName} />

      {canWrite ? (
        <section className="border-border bg-surface rounded-[var(--radius-lg)] border p-5">
          <h2 className="text-foreground mb-4 text-base font-semibold">
            Registrar
          </h2>
          <EntryComposer childIds={[childId]} />
        </section>
      ) : null}

      {isLegalGuardian || authorizations.length > 0 ? (
        <section className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-lg)] border p-5">
          <h2 className="text-foreground text-base font-semibold">
            Medicamentos
          </h2>
          {isLegalGuardian ? (
            <details className="flex flex-col gap-3">
              <summary className="text-brand min-h-[var(--touch-min)] cursor-pointer text-sm font-medium">
                Autorizar um medicamento
              </summary>
              <div className="mt-3">
                <AuthorizeForm childId={childId} />
              </div>
            </details>
          ) : null}
          <AdministerPanel
            childId={childId}
            authorizations={authorizations}
            canAdminister={canWrite}
          />
        </section>
      ) : null}

      <section aria-label="Linha do tempo">
        <Timeline
          entries={entries}
          mediaUrls={mediaUrls}
          reactionsByEntry={reactionsByEntry}
          canReact={canReact}
        />
      </section>
    </main>
  );
}

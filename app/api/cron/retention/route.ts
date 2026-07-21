import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Compara em tempo constante (via hash de tamanho fixo) — evita canal lateral de timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Cron de retenção LGPD: elimina o diário de rotina + fotos de crianças que saíram
 * há mais que a carência (default 90 dias). Protegido por CRON_SECRET (server-only)
 * — sem isso a rota é negada, para não ser um endpoint aberto que apaga dados.
 *
 * Agende no host (ex.: Vercel Cron / pg_cron chamando esta URL) 1x/dia com o header
 * Authorization: Bearer <CRON_SECRET>.
 */
export const dynamic = "force-dynamic";

type RetentionRow = {
  org_id: string;
  deleted_count: number;
  media_paths: string[] | null;
};

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !secretMatches(auth, `Bearer ${secret}`)) {
    return new NextResponse("Não autorizado", { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("run_diary_retention", {
    p_default_grace: 90,
  });
  if (error) {
    console.error("[retention] falha ao rodar o purge");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const rows = (data ?? []) as RetentionRow[];
  let mediaDeleted = 0;
  let mediaOrphaned = 0;
  for (const r of rows) {
    const paths = (r.media_paths ?? []).filter(Boolean);
    if (paths.length === 0) continue;
    const { error: rmError } = await admin.storage
      .from("child-media")
      .remove(paths);
    if (rmError) {
      // O diário já foi eliminado; se a foto não sai do Storage, NÃO perde o rastro:
      // registra os caminhos órfãos na auditoria para retry/limpeza manual.
      console.error("[retention] falha ao apagar fotos no Storage");
      mediaOrphaned += paths.length;
      await admin.from("audit_events").insert({
        organization_id: r.org_id,
        action: "data.retention_media_orphaned",
        metadata: { paths, erro: rmError.message },
      });
    } else {
      mediaDeleted += paths.length;
    }
  }
  const diaryDeleted = rows.reduce((s, r) => s + (r.deleted_count ?? 0), 0);

  return NextResponse.json({
    ok: true,
    diaryDeleted,
    mediaDeleted,
    mediaOrphaned,
  });
}

// Aceita GET (Vercel Cron) e POST.
export const GET = handle;
export const POST = handle;

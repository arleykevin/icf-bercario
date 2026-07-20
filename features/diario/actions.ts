"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  buildPayload,
  recordEntrySchema,
  type RecordEntryInput,
} from "./schema";

export type RecordState = {
  error?: string;
  message?: string;
  count?: number;
};

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MiB (espelha o file_size_limit do bucket)
const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function optStr(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
}

function optNum(formData: FormData, key: string): number | undefined {
  const s = optStr(formData, key);
  if (s === undefined) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Registra um evento no Diário — para UMA ou VÁRIAS crianças (ação em lote).
 * A autorização real é a RLS (diary_insert: admin OU professor da criança) + o
 * trigger que deriva class_id da matrícula. Aqui só montamos as linhas e mandamos
 * via sessão autenticada — nada de service_role. idempotency_key por linha já deixa
 * o outbox offline (Fase 1.1) plug-and-play.
 */
export async function recordDiaryEntries(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const rawChildIds = optStr(formData, "childIds");
  const input: Partial<RecordEntryInput> = {
    entryType: optStr(formData, "entryType") as RecordEntryInput["entryType"],
    childIds: rawChildIds ? rawChildIds.split(",").filter(Boolean) : [],
    note: optStr(formData, "note"),
    temperatureC: optNum(formData, "temperatureC"),
    acceptance: optStr(
      formData,
      "acceptance",
    ) as RecordEntryInput["acceptance"],
    item: optStr(formData, "item"),
    sleepMinutes: optNum(formData, "sleepMinutes"),
    diaperKind: optStr(
      formData,
      "diaperKind",
    ) as RecordEntryInput["diaperKind"],
    mood: optStr(formData, "mood") as RecordEntryInput["mood"],
    activityTitle: optStr(formData, "activityTitle"),
    occurredAt: optStr(formData, "occurredAt"),
  };

  const parsed = recordEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  // Resolve a organização pelas crianças que o usuário PODE ver (RLS). Se alguma
  // não voltar, ele não tem acesso — barra antes mesmo do insert.
  const { data: kids } = await supabase
    .from("children")
    .select("id, organization_id")
    .in("id", v.childIds);

  const rows = (kids ?? []) as { id: string; organization_id: string }[];
  if (rows.length !== v.childIds.length) {
    return { error: "Você não tem acesso a uma das crianças selecionadas." };
  }
  const orgIds = new Set(rows.map((r) => r.organization_id));
  if (orgIds.size !== 1) {
    return { error: "As crianças precisam ser da mesma escola." };
  }
  const organizationId = rows[0].organization_id;

  const occurredAt = v.occurredAt ?? new Date().toISOString();
  const payload = buildPayload(v);
  const batchId = v.childIds.length > 1 ? crypto.randomUUID() : null;

  // Foto: só para registro de UMA criança. Sobe pro bucket PRIVADO (a RLS de storage
  // garante que só quem cuida da criança envia); a UI depois lê via signed URL.
  let mediaPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0 && v.childIds.length === 1) {
    const ext = PHOTO_EXT[photo.type];
    if (!ext) return { error: "A foto deve ser JPG, PNG ou WEBP." };
    if (photo.size > MAX_PHOTO_BYTES) {
      return { error: "Foto muito grande (máx. 8 MB)." };
    }
    const path = `${organizationId}/${v.childIds[0]}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("child-media")
      .upload(path, photo, { contentType: photo.type, upsert: false });
    if (upErr) {
      return { error: "Não foi possível enviar a foto. Tente de novo." };
    }
    mediaPath = path;
  }

  const insertRows = v.childIds.map((childId) => ({
    organization_id: organizationId,
    child_id: childId,
    entry_type: v.entryType,
    occurred_at: occurredAt,
    note: v.note ?? null,
    temperature_c: v.temperatureC ?? null,
    payload,
    batch_id: batchId,
    idempotency_key: crypto.randomUUID(),
    recorded_by: user.id,
    media_path: mediaPath,
  }));

  const { error, data } = await supabase
    .from("diary_entries")
    .insert(insertRows)
    .select("id");

  if (error) {
    return {
      error:
        "Não foi possível registrar. Confira se você cuida desta(s) criança(s).",
    };
  }

  const classId = optStr(formData, "classId");
  if (classId) revalidatePath(`/turma/${classId}`);
  for (const childId of v.childIds) revalidatePath(`/crianca/${childId}`);
  revalidatePath("/inicio");

  const count = data?.length ?? v.childIds.length;
  return {
    count,
    message:
      count > 1 ? `Registrado para ${count} crianças.` : "Registro salvo.",
  };
}

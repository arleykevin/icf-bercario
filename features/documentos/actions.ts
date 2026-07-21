"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DocState = { error?: string; message?: string };

const EXT_BY_MIME = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const DOC_TYPES = new Set(["vaccine", "medical", "authorization", "other"]);
const MAX_BYTES = 15 * 1024 * 1024;

/** Envia um documento da criança (vacina/laudo). Responsável ou admin (RLS). */
export async function uploadDocument(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const childId = String(formData.get("childId") ?? "");
  const docTypeRaw = String(formData.get("docType") ?? "other");
  const docType = DOC_TYPES.has(docTypeRaw) ? docTypeRaw : "other";
  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!childId || !title) return { error: "Dê um título ao documento." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Anexe um arquivo." };
  }
  const ext = EXT_BY_MIME.get(file.type);
  if (!ext) return { error: "Formato não suportado (PDF, JPG, PNG ou WEBP)." };
  if (file.size > MAX_BYTES) return { error: "O arquivo deve ter até 15 MB." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: child } = await supabase
    .from("children")
    .select("organization_id")
    .eq("id", childId)
    .maybeSingle();
  const org = child?.organization_id as string | undefined;
  if (!org) return { error: "Sem acesso a esta criança." };

  const path = `${org}/${childId}/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("child-documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: "Não foi possível enviar o arquivo." };

  const { error: insErr } = await supabase.from("child_documents").insert({
    organization_id: org,
    child_id: childId,
    doc_type: docType,
    title: title.slice(0, 120),
    storage_path: path,
  });
  if (insErr) {
    // Reverte o upload se a linha não gravou (evita arquivo órfão).
    await supabase.storage.from("child-documents").remove([path]);
    return { error: "Não foi possível salvar o documento." };
  }

  revalidatePath(`/crianca/${childId}/perfil`);
  return { message: "Documento enviado." };
}

/** Remove um documento (quem enviou ou admin — RLS). Apaga a linha e o arquivo. */
export async function deleteDocument(
  childId: string,
  id: string,
  storagePath: string,
): Promise<DocState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data, error } = await supabase
    .from("child_documents")
    .delete()
    .eq("id", id)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "Você não pode remover este documento." };
  }
  await supabase.storage.from("child-documents").remove([storagePath]);

  revalidatePath(`/crianca/${childId}/perfil`);
  return { message: "Documento removido." };
}

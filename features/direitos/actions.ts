"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RequestState = { error?: string; message?: string };

/**
 * Responsável registra um pedido de ACESSO (cópia) ou ELIMINAÇÃO dos dados do
 * filho (LGPD art. 18). A RLS exige is_guardian_of; a autoria é fixada por trigger.
 */
export async function fileDataRequest(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const requestType = String(formData.get("requestType") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (
    !organizationId ||
    !childId ||
    (requestType !== "access" && requestType !== "deletion")
  ) {
    return { error: "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.from("data_requests").insert({
    organization_id: organizationId,
    child_id: childId,
    request_type: requestType,
    note,
  });
  if (error) {
    return {
      error: "Não foi possível registrar o pedido. Confirme seu vínculo.",
    };
  }

  revalidatePath(`/crianca/${childId}/perfil`);
  return { message: "Pedido registrado. A escola vai acompanhar." };
}

/** Admin resolve um pedido (RLS restringe o update a admin da org). */
export async function resolveDataRequest(
  id: string,
  status: "done" | "rejected",
  resolutionNote: string | null,
): Promise<RequestState> {
  if (status !== "done" && status !== "rejected") {
    return { error: "Status inválido." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data, error } = await supabase
    .from("data_requests")
    .update({ status, resolution_note: resolutionNote })
    .eq("id", id)
    .select("id");
  if (error) return { error: "Não foi possível atualizar o pedido." };
  // 0 linhas = a RLS bloqueou (não é admin desta org) — não reporta sucesso falso.
  if (!data || data.length === 0) {
    return { error: "Você não tem permissão para resolver este pedido." };
  }

  revalidatePath("/gestao");
  return { message: "Pedido atualizado." };
}

/**
 * Exporta os dados do filho como JSON (direito de acesso/portabilidade). A RLS
 * garante o acesso: quem não pode ver a criança recebe vazio.
 */
export async function exportChildData(
  childId: string,
): Promise<{ error?: string; json?: string; fileName?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: child } = await supabase
    .from("children")
    .select("id, organization_id, full_name, birth_date")
    .eq("id", childId)
    .maybeSingle();
  if (!child) return { error: "Sem acesso a esta criança." };
  const orgId = child.organization_id as string;

  // Gate de papel (minimização): export é direito do RESPONSÁVEL (ou admin/DPO),
  // não de qualquer um que a RLS deixe ler a criança (ex.: professor). Também
  // registra o acesso na auditoria (accountability LGPD).
  const { error: authzError } = await supabase.rpc("record_data_export", {
    p_org: orgId,
    p_child: childId,
  });
  if (authzError) {
    return { error: "Você não tem permissão para exportar estes dados." };
  }

  const EXPORT_LIMIT = 5000;
  const [{ data: health }, { data: diary }] = await Promise.all([
    supabase
      .from("child_health")
      .select("blood_type, allergies, dietary_restrictions, medical_notes")
      .eq("child_id", childId)
      .maybeSingle(),
    supabase
      .from("diary_entries")
      .select("entry_type, occurred_at, note, temperature_c, payload")
      .eq("child_id", childId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(EXPORT_LIMIT),
  ]);

  const diarioRows = diary ?? [];
  const doc = {
    exportado_em: new Date().toISOString(),
    crianca: child,
    saude: health ?? null,
    diario: diarioRows,
    // Sinaliza se o diário foi truncado (portabilidade completa exige paginação).
    diario_truncado: diarioRows.length >= EXPORT_LIMIT,
  };
  // Slug para o nome do arquivo: NFD decompõe acentos e o replace geral remove as
  // marcas combinantes (não-alfanuméricas) junto — sem regex de faixa combinante.
  const slug =
    String(child.full_name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "crianca";
  return { json: JSON.stringify(doc, null, 2), fileName: `dados-${slug}.json` };
}

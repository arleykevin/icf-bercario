"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { administerMedSchema, authorizeMedSchema } from "./schema";

export type MedState = { error?: string; message?: string };

type DbClient = Awaited<ReturnType<typeof createClient>>;

/** Org da criança (o usuário PODE lê-la por RLS: admin/professor/responsável). */
async function orgOfChild(
  supabase: DbClient,
  childId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from("children")
    .select("organization_id")
    .eq("id", childId)
    .maybeSingle();
  return (data?.organization_id as string | undefined) ?? undefined;
}

/**
 * Responsável LEGAL autoriza um medicamento. A RLS (med_auth_insert) exige
 * is_legal_guardian_of; signer/timestamp/hash são fixados por trigger no servidor.
 */
export async function authorizeMedication(
  _prev: MedState,
  formData: FormData,
): Promise<MedState> {
  const parsed = authorizeMedSchema.safeParse({
    childId: formData.get("childId"),
    medicationName: formData.get("medicationName"),
    dosage: formData.get("dosage"),
    route: (formData.get("route") as string) || undefined,
    instructions: (formData.get("instructions") as string) || undefined,
    validFrom: (formData.get("validFrom") as string) || undefined,
    validUntil: formData.get("validUntil"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const org = await orgOfChild(supabase, v.childId);
  if (!org) return { error: "Criança não encontrada." };

  const { error } = await supabase.from("medication_authorizations").insert({
    organization_id: org,
    child_id: v.childId,
    medication_name: v.medicationName,
    dosage: v.dosage,
    route: v.route ?? null,
    instructions: v.instructions ?? null,
    valid_from: v.validFrom || undefined,
    valid_until: v.validUntil,
  });
  if (error) {
    return {
      error:
        "Não foi possível autorizar. Só o responsável legal da criança pode assinar.",
    };
  }

  revalidatePath(`/crianca/${v.childId}`);
  return { message: "Medicamento autorizado." };
}

/**
 * Educador (professor da criança/admin) registra uma administração. Triggers do
 * banco validam a autorização vigente e emitem o evento 'medication' na timeline.
 */
export async function administerMedication(
  _prev: MedState,
  formData: FormData,
): Promise<MedState> {
  const parsed = administerMedSchema.safeParse({
    childId: formData.get("childId"),
    authorizationId: formData.get("authorizationId"),
    status: formData.get("status"),
    note: (formData.get("note") as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const org = await orgOfChild(supabase, v.childId);
  if (!org) return { error: "Criança não encontrada." };

  const { error } = await supabase.from("medication_administrations").insert({
    organization_id: org,
    child_id: v.childId,
    authorization_id: v.authorizationId,
    status: v.status,
    note: v.note ?? null,
  });
  if (error) {
    return {
      error:
        "Não foi possível registrar. Confira a autorização vigente e se você cuida da criança.",
    };
  }

  revalidatePath(`/crianca/${v.childId}`);
  return { message: "Administração registrada." };
}

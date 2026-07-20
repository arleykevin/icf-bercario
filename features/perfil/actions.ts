"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { healthSchema, pickupSchema } from "./schema";

export type PerfilState = { error?: string; message?: string };

type DbClient = Awaited<ReturnType<typeof createClient>>;

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

/** Salva a ficha de saúde (upsert por criança). RLS: admin ou responsável. */
export async function upsertHealth(
  _prev: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
  const parsed = healthSchema.safeParse({
    childId: formData.get("childId"),
    bloodType: (formData.get("bloodType") as string) || undefined,
    allergies: (formData.get("allergies") as string) || undefined,
    dietaryRestrictions:
      (formData.get("dietaryRestrictions") as string) || undefined,
    medicalNotes: (formData.get("medicalNotes") as string) || undefined,
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

  const { error } = await supabase.from("child_health").upsert(
    {
      organization_id: org,
      child_id: v.childId,
      blood_type: v.bloodType ?? null,
      allergies: v.allergies ?? null,
      dietary_restrictions: v.dietaryRestrictions ?? null,
      medical_notes: v.medicalNotes ?? null,
      updated_by: user.id,
    },
    { onConflict: "child_id" },
  );
  if (error) {
    return { error: "Não foi possível salvar a ficha de saúde." };
  }

  revalidatePath(`/crianca/${v.childId}/perfil`);
  return { message: "Ficha de saúde salva." };
}

/** Adiciona pessoa autorizada a retirar. RLS: admin ou responsável LEGAL. */
export async function addPickup(
  _prev: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
  const parsed = pickupSchema.safeParse({
    childId: formData.get("childId"),
    name: formData.get("name"),
    relationship: (formData.get("relationship") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
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

  const { error } = await supabase.from("authorized_pickups").insert({
    organization_id: org,
    child_id: v.childId,
    name: v.name,
    relationship: v.relationship ?? null,
    phone: v.phone ?? null,
  });
  if (error) {
    return {
      error:
        "Não foi possível adicionar. Só o responsável legal ou a gestão podem.",
    };
  }

  revalidatePath(`/crianca/${v.childId}/perfil`);
  return { message: "Autorizado adicionado." };
}

/** Revoga (soft-delete) um autorizado. RLS: admin ou responsável LEGAL. */
export async function removePickup(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const childId = String(formData.get("childId") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("authorized_pickups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (childId) revalidatePath(`/crianca/${childId}/perfil`);
}

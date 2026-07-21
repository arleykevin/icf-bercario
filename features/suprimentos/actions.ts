"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SupplyState = { error?: string; message?: string };

async function childOrg(
  supabase: SupabaseClient,
  childId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("children")
    .select("organization_id")
    .eq("id", childId)
    .maybeSingle();
  return (data?.organization_id as string) ?? null;
}

/** Sinaliza um item acabando (professor da criança ou admin — RLS). */
export async function createSupply(
  childId: string,
  item: string,
): Promise<SupplyState> {
  const clean = item.trim();
  if (!clean) return { error: "Diga o que está acabando." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  const org = await childOrg(supabase, childId);
  if (!org) return { error: "Sem acesso." };

  const { error } = await supabase.from("supply_requests").insert({
    organization_id: org,
    child_id: childId,
    item: clean.slice(0, 80),
  });
  if (error) return { error: "Não foi possível registrar." };
  revalidatePath(`/crianca/${childId}`);
  return { message: "Registrado." };
}

/** Marca como resolvido (professor da criança ou admin — RLS). */
export async function resolveSupply(
  childId: string,
  id: string,
): Promise<SupplyState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supply_requests")
    .update({ status: "resolved" })
    .eq("id", id)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "Não foi possível atualizar." };
  }
  revalidatePath(`/crianca/${childId}`);
  return { message: "Resolvido." };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EntryReactions = {
  heartCount: number;
  myHeartId: string | null;
  comments: { id: string; author: string; text: string; mine: boolean }[];
};

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

/** Curte/descurte um registro (❤️ é toggle). Só responsável (RLS). */
export async function toggleHeart(
  childId: string,
  entryId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: existing } = await supabase
    .from("diary_reactions")
    .select("id")
    .eq("diary_entry_id", entryId)
    .eq("author_id", user.id)
    .eq("kind", "heart")
    .maybeSingle();

  if (existing) {
    await supabase.from("diary_reactions").delete().eq("id", existing.id);
  } else {
    const org = await childOrg(supabase, childId);
    if (!org) return { error: "Sem acesso." };
    const { error } = await supabase.from("diary_reactions").insert({
      organization_id: org,
      child_id: childId,
      diary_entry_id: entryId,
      kind: "heart",
    });
    if (error) return { error: "Não foi possível reagir." };
  }
  revalidatePath(`/crianca/${childId}`);
  return {};
}

/** Comenta um registro. Só responsável (RLS). */
export async function addComment(
  childId: string,
  entryId: string,
  text: string,
): Promise<{ error?: string }> {
  const clean = text.trim();
  if (!clean) return { error: "Escreva algo." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const org = await childOrg(supabase, childId);
  if (!org) return { error: "Sem acesso." };
  const { error } = await supabase.from("diary_reactions").insert({
    organization_id: org,
    child_id: childId,
    diary_entry_id: entryId,
    kind: "comment",
    comment: clean.slice(0, 500),
  });
  if (error) return { error: "Não foi possível comentar." };
  revalidatePath(`/crianca/${childId}`);
  return {};
}

/** Remove uma reação/comentário do próprio autor (RLS: author = self). */
export async function deleteReaction(
  childId: string,
  id: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("diary_reactions")
    .delete()
    .eq("id", id);
  if (error) return { error: "Não foi possível remover." };
  revalidatePath(`/crianca/${childId}`);
  return {};
}

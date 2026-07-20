"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createEventSchema } from "./schema";

export type CalendarState = { error?: string; message?: string };

type DbClient = Awaited<ReturnType<typeof createClient>>;

async function adminOrgId(
  supabase: DbClient,
  uid: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from("org_members")
    .select("organization_id")
    .eq("profile_id", uid)
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data?.organization_id as string | undefined) ?? undefined;
}

/** Gestão cria um evento/cardápio. Autorização real: RLS calendar_admin_write. */
export async function createCalendarEvent(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const parsed = createEventSchema.safeParse({
    eventType: formData.get("eventType"),
    title: formData.get("title"),
    description: (formData.get("description") as string) || undefined,
    eventDate: formData.get("eventDate"),
    classId: (formData.get("classId") as string) || "",
    startTime: (formData.get("startTime") as string) || undefined,
    endTime: (formData.get("endTime") as string) || undefined,
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

  const org = await adminOrgId(supabase, user.id);
  if (!org) return { error: "Você não administra nenhuma escola." };

  const { error } = await supabase.from("calendar_events").insert({
    organization_id: org,
    class_id: v.classId && v.classId !== "" ? v.classId : null,
    event_type: v.eventType,
    title: v.title,
    description: v.description ?? null,
    event_date: v.eventDate,
    start_time: v.startTime || null,
    end_time: v.endTime || null,
    created_by: user.id,
  });
  if (error) return { error: "Não foi possível criar o evento." };

  revalidatePath("/calendario");
  revalidatePath("/inicio");
  return { message: "Evento adicionado ao calendário." };
}

/** Soft-delete de um evento (só admin, via RLS). */
export async function deleteCalendarEvent(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("calendar_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/calendario");
}

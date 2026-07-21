"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyGuardiansOfComm } from "@/lib/push/send";
import { createCommSchema } from "./schema";

export type CommState = { error?: string; message?: string };

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

/** Publica um comunicado. RLS: admin (qualquer escopo) ou professor (própria turma). */
export async function createCommunication(
  _prev: CommState,
  formData: FormData,
): Promise<CommState> {
  const parsed = createCommSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    priority: formData.get("priority") || "normal",
    classId: (formData.get("classId") as string) || "",
    requiresAck: formData.get("requiresAck") === "on",
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

  const classId = v.classId && v.classId !== "" ? v.classId : null;

  // Org vem da turma (se for de turma) ou da escola que administro.
  let org: string | undefined;
  if (classId) {
    const { data: klass } = await supabase
      .from("classes")
      .select("organization_id")
      .eq("id", classId)
      .maybeSingle();
    org = klass?.organization_id as string | undefined;
  } else {
    org = await adminOrgId(supabase, user.id);
  }
  if (!org) return { error: "Não foi possível identificar a escola." };

  const { error } = await supabase.from("communications").insert({
    organization_id: org,
    class_id: classId,
    title: v.title,
    body: v.body,
    priority: v.priority,
    requires_ack: v.requiresAck ?? true,
  });
  if (error) {
    return {
      error:
        "Não foi possível publicar. Confira se você é admin ou professor desta turma.",
    };
  }

  // Notifica os responsáveis (payload genérico). Best-effort: no-op sem VAPID.
  try {
    await notifyGuardiansOfComm(org, classId);
  } catch {
    // não bloqueia a publicação do comunicado.
  }

  revalidatePath("/comunicados");
  revalidatePath("/inicio");
  return { message: "Comunicado publicado." };
}

/** Registra "Ciente" (imutável). guardian_id é fixado por trigger no servidor. */
export async function acknowledgeCommunication(
  formData: FormData,
): Promise<void> {
  const communicationId = String(formData.get("communicationId") ?? "");
  if (!communicationId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: comm } = await supabase
    .from("communications")
    .select("organization_id")
    .eq("id", communicationId)
    .maybeSingle();
  if (!comm) return;

  await supabase.from("communication_acks").insert({
    organization_id: comm.organization_id as string,
    communication_id: communicationId,
  });

  revalidatePath("/comunicados");
}

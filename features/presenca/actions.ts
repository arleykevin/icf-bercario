"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AttendanceState = { error?: string; message?: string };

/**
 * Registra entrada/saída da criança (imutável). recorded_by é fixado por trigger;
 * a RLS exige admin ou professor da criança.
 */
export async function recordAttendance(
  _prev: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  const childId = String(formData.get("childId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const counterpartName =
    (formData.get("counterpartName") as string)?.trim() || null;
  const classId = String(formData.get("classId") ?? "");

  if (!childId || (kind !== "checkin" && kind !== "checkout")) {
    return { error: "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const { data: child } = await supabase
    .from("children")
    .select("organization_id")
    .eq("id", childId)
    .maybeSingle();
  if (!child) return { error: "Criança não encontrada." };

  const { error } = await supabase.from("attendance_events").insert({
    organization_id: child.organization_id as string,
    child_id: childId,
    kind,
    counterpart_name: counterpartName,
  });
  if (error) {
    return {
      error: "Não foi possível registrar. Confira se você cuida desta criança.",
    };
  }

  if (classId) revalidatePath(`/turma/${classId}`);
  revalidatePath(`/crianca/${childId}`);
  return {
    message: kind === "checkin" ? "Entrada registrada." : "Saída registrada.",
  };
}

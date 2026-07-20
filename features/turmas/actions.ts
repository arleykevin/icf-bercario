"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClassSchema, enrollSchema } from "./schema";

export type ClassState = { error?: string; message?: string };

type DbClient = Awaited<ReturnType<typeof createClient>>;

/** Organização em que o usuário é admin ativo (RLS já garante, aqui é conveniência). */
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

/** Cria uma turma na escola do admin. Autorização real: RLS classes_admin_insert. */
export async function createClass(
  _prev: ClassState,
  formData: FormData,
): Promise<ClassState> {
  const parsed = createClassSchema.safeParse({
    name: formData.get("name"),
    ageGroup: (formData.get("ageGroup") as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const org = await adminOrgId(supabase, user.id);
  if (!org) return { error: "Você não administra nenhuma escola." };

  const { error } = await supabase.from("classes").insert({
    organization_id: org,
    name: parsed.data.name,
    age_group: parsed.data.ageGroup ?? null,
    created_by: user.id,
  });
  if (error) return { error: "Não foi possível criar a turma." };

  revalidatePath("/gestao");
  revalidatePath("/inicio");
  return { message: `Turma "${parsed.data.name}" criada.` };
}

/** Matricula crianças numa turma (idempotente). Autorização real: RLS enrollments_admin_write. */
export async function enrollChildren(
  _prev: ClassState,
  formData: FormData,
): Promise<ClassState> {
  const raw = String(formData.get("childIds") ?? "");
  const parsed = enrollSchema.safeParse({
    classId: String(formData.get("classId") ?? ""),
    childIds: raw.split(",").filter(Boolean),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  // A org vem da turma (o admin consegue lê-la por RLS); nunca do cliente.
  const { data: klass } = await supabase
    .from("classes")
    .select("organization_id")
    .eq("id", parsed.data.classId)
    .maybeSingle();
  if (!klass) return { error: "Turma não encontrada." };
  const org = klass.organization_id as string;

  const rows = parsed.data.childIds.map((childId) => ({
    organization_id: org,
    child_id: childId,
    class_id: parsed.data.classId,
  }));

  const { error } = await supabase
    .from("enrollments")
    .upsert(rows, { onConflict: "child_id,class_id", ignoreDuplicates: true });
  if (error) {
    return { error: "Não foi possível matricular. Confira se você é admin." };
  }

  revalidatePath("/gestao");
  revalidatePath(`/turma/${parsed.data.classId}`);
  revalidatePath("/inicio");
  return {
    message: `Matrícula atualizada (${rows.length} criança(s)).`,
  };
}

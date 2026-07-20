"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { randomSlugSuffix } from "@/lib/tokens";
import { schoolSchema } from "./schema";

export type OnboardingState = { error?: string };

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "escola"
  );
}

/** Cria a escola e torna o usuário atual o primeiro admin (via RPC create_school). */
export async function createSchool(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = schoolSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const slug = `${slugify(parsed.data.name)}-${randomSlugSuffix()}`;
  const { error } = await supabase.rpc("create_school", {
    p_name: parsed.data.name,
    p_slug: slug,
  });
  if (error) {
    return { error: "Não foi possível criar a escola. Tente novamente." };
  }

  revalidatePath("/", "layout");
  redirect("/inicio");
}

export type ImportState = {
  error?: string;
  message?: string;
  inserted?: number;
};

/**
 * Importa crianças a partir de um CSV (linhas "Nome, AAAA-MM-DD" ou "Nome, DD/MM/AAAA").
 * Insere via client autenticado — a RLS (children_admin_insert) exige que o usuário
 * seja admin da organização. Nada de service_role.
 */
export async function bulkImportChildren(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const csv = String(formData.get("csv") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: adminOrg } = await supabase
    .from("org_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!adminOrg) {
    return { error: "Você não é administrador de nenhuma escola." };
  }

  const { rows, errors } = parseChildrenCsv(csv);
  if (rows.length === 0) {
    return { error: errors[0] ?? "Nenhuma linha válida encontrada no CSV." };
  }

  const payload = rows.map((r) => ({
    organization_id: adminOrg.organization_id as string,
    full_name: r.full_name,
    birth_date: r.birth_date,
    created_by: user.id,
  }));

  const { data, error } = await supabase
    .from("children")
    .insert(payload)
    .select("id");
  if (error) {
    return {
      error: "Falha ao importar. Verifique se você é admin e tente de novo.",
    };
  }

  const inserted = data?.length ?? 0;
  revalidatePath("/inicio");
  return {
    inserted,
    message:
      `Importadas ${inserted} criança(s).` +
      (errors.length ? ` ${errors.length} linha(s) ignorada(s).` : ""),
  };
}

function parseChildrenCsv(text: string): {
  rows: { full_name: string; birth_date: string }[];
  errors: string[];
} {
  const rows: { full_name: string; birth_date: string }[] = [];
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const [i, line] of lines.entries()) {
    const parts = line.split(",").map((p) => p.trim());
    const name = parts[0] ?? "";
    const rawDate = parts[1] ?? "";

    // Pula um possível cabeçalho na 1ª linha.
    if (i === 0 && /nome|nasc/i.test(name)) continue;

    const birth = normalizeDate(rawDate);
    if (name.length < 2 || !birth) {
      errors.push(`Linha ${i + 1} inválida.`);
      continue;
    }
    rows.push({ full_name: name, birth_date: birth });
  }
  return { rows, errors };
}

/** Aceita AAAA-MM-DD ou DD/MM/AAAA; retorna ISO (AAAA-MM-DD) ou null. */
function normalizeDate(input: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (iso) return isValidYmd(+iso[1], +iso[2], +iso[3]) ? input : null;

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (br) {
    const [d, m, y] = [+br[1], +br[2], +br[3]];
    return isValidYmd(y, m, d)
      ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      : null;
  }
  return null;
}

function isValidYmd(y: number, m: number, d: number) {
  return y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

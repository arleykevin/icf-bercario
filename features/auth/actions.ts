"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";
import { loginSchema, magicLinkSchema } from "./schema";

export type AuthState = { error?: string; message?: string };

/**
 * Login por e-mail/senha. Mensagem de erro é GENÉRICA (anti-enumeração de usuário —
 * PLANO.md §5.2). Em caso de sucesso, redireciona para a área autenticada.
 */
export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  revalidatePath("/", "layout");
  redirect("/inicio");
}

/**
 * Envia um link mágico. Resposta NEUTRA (não revela se o e-mail existe).
 */
export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteURL();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/inicio` },
  });
  if (error) {
    return { error: "Não foi possível enviar o link agora. Tente novamente." };
  }

  return {
    message: "Se o e-mail estiver cadastrado, enviamos um link de acesso.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

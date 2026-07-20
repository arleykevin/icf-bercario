"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";
import {
  clientIp,
  hashIdentifier,
  LIMITS,
  rateLimit,
  rateLimitPeek,
  rateLimitReset,
} from "@/lib/security/rate-limit";
import { loginSchema, magicLinkSchema } from "./schema";

export type AuthState = { error?: string; message?: string };

const TOO_MANY = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

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

  // Rate limit baseado em FALHAS por IP (não bloqueia por e-mail, que permitiria
  // travar a conta de uma vítima; não conta sucessos, que travariam o tablet
  // compartilhado). O IP é hasheado (é PII). Sem IP confiável, não aplica o limite.
  const ip = await clientIp();
  const ipKey = ip ? hashIdentifier(ip) : null;

  if (ipKey) {
    const ok = await rateLimitPeek(
      LIMITS.loginFailIp.bucket,
      ipKey,
      LIMITS.loginFailIp.max,
      LIMITS.loginFailIp.window,
    );
    if (!ok) return { error: TOO_MANY };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Conta a falha (só quando há IP confiável). Mensagem GENÉRICA (anti-enumeração).
    if (ipKey) {
      await rateLimit(
        LIMITS.loginFailIp.bucket,
        ipKey,
        LIMITS.loginFailIp.max,
        LIMITS.loginFailIp.window,
      );
    }
    return { error: "E-mail ou senha incorretos." };
  }

  // Sucesso: zera as falhas deste IP — quem sabe a senha nunca fica preso.
  if (ipKey) await rateLimitReset(LIMITS.loginFailIp.bucket, ipKey);

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

  // Rate limit de volume no envio de link mágico (freia bombardeio de inbox). Por
  // IP confiável (se houver) e por e-mail. Resposta sempre NEUTRA.
  const NEUTRAL = {
    message: "Se o e-mail estiver cadastrado, enviamos um link de acesso.",
  } satisfies AuthState;

  const ip = await clientIp();
  if (ip) {
    const byIp = await rateLimit(
      LIMITS.magicIp.bucket,
      hashIdentifier(ip),
      LIMITS.magicIp.max,
      LIMITS.magicIp.window,
    );
    if (!byIp.allowed) return NEUTRAL;
  }
  const byEmail = await rateLimit(
    LIMITS.magicEmail.bucket,
    hashIdentifier(parsed.data.email),
    LIMITS.magicEmail.max,
    LIMITS.magicEmail.window,
  );
  if (!byEmail.allowed) return NEUTRAL;

  const supabase = await createClient();
  const siteUrl = await getSiteURL();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/inicio` },
  });
  if (error) {
    return { error: "Não foi possível enviar o link agora. Tente novamente." };
  }

  return NEUTRAL;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

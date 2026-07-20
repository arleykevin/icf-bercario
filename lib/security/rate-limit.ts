import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting server-side (PLANO.md §5.3, §9 riscos #4/#16). Os contadores ficam
 * em Postgres e são tocados via o admin client (service_role) — os RPCs NÃO são
 * expostos a anon/authenticated, então o identificador (IP) é sempre derivado no
 * servidor e o cliente não pode forjá-lo para travar a conta de uma vítima.
 *
 * Estratégia (endurecida por auditoria adversarial):
 *  - Login por senha: conta só FALHAS por IP e reseta no sucesso. Quem acerta a
 *    senha NUNCA é travado (nem por si nem por falhas de terceiros no mesmo IP),
 *    o que evita lockout dirigido de vítima e o auto-DoS do tablet compartilhado
 *    (NAT do berçário sai por um IP só).
 *  - Magic link: limite de volume por IP e por e-mail (resposta sempre neutra).
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * IP CONFIÁVEL do cliente. NÃO usa o valor mais à esquerda de x-forwarded-for (o
 * cliente pode injetá-lo e rotacionar para burlar o limite). Prefere `x-real-ip`
 * (setado pela plataforma/proxy, não repassável pelo cliente) e, na falta, o valor
 * mais à DIREITA do XFF (adicionado pelo proxy mais próximo). Retorna `null` quando
 * não há fonte confiável — o chamador então NÃO aplica o limite por IP (fail-open
 * observável) em vez de jogar todo mundo num bucket global 'unknown'.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();

  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const rightmost = parts.at(-1);
    if (rightmost) return rightmost;
  }

  return null;
}

/** Hash estável de valor sensível (e-mail, IP) — não guardamos PII no contador. */
export function hashIdentifier(value: string): string {
  return createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/** Loga (sem PII) quando o rate limit falha aberto, para não ficar invisível. */
function failOpen(reason: string): void {
  console.warn(`[rate-limit] fail-open (${reason}) — limite não aplicado`);
}

/**
 * Consome uma batida no bucket (incrementa) e diz se está dentro do limite.
 * FAIL-OPEN observável: se o contador estiver indisponível, libera e loga.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_touch", {
      p_bucket: bucket,
      p_identifier: identifier,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      failOpen(error ? "rpc-error" : "sem-linha");
      return { allowed: true, remaining: max, retryAfterSeconds: 0 };
    }
    return {
      allowed: Boolean(row.allowed),
      remaining: Number(row.remaining ?? 0),
      retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
    };
  } catch {
    failOpen("exceção");
    return { allowed: true, remaining: max, retryAfterSeconds: 0 };
  }
}

/** Lê o contador SEM incrementar. Fail-open: `true` se indisponível. */
export async function rateLimitPeek(
  bucket: string,
  identifier: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_peek", {
      p_bucket: bucket,
      p_identifier: identifier,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      failOpen(error ? "peek-rpc-error" : "peek-sem-linha");
      return true;
    }
    return Boolean(row.allowed);
  } catch {
    failOpen("peek-exceção");
    return true;
  }
}

/** Zera as batidas de um bucket/identificador (chamado no login bem-sucedido). */
export async function rateLimitReset(
  bucket: string,
  identifier: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.rpc("rate_limit_reset", {
      p_bucket: bucket,
      p_identifier: identifier,
    });
  } catch {
    // Reset é best-effort; a janela expira sozinha de qualquer forma.
  }
}

/** Limites por operação (bucket, max, janela em segundos). */
export const LIMITS = {
  // Login: só FALHAS por IP; teto folgado p/ NAT compartilhado; reseta no sucesso.
  loginFailIp: { bucket: "login_fail_ip", max: 20, window: 900 },
  // Magic link: volume por IP e por e-mail (evita bombardeio de inbox).
  magicIp: { bucket: "magiclink_ip", max: 8, window: 900 },
  magicEmail: { bucket: "magiclink_email", max: 4, window: 900 },
} as const;

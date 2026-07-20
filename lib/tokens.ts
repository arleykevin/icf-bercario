import "server-only";
import { randomBytes, createHash } from "node:crypto";

/**
 * Token de convite: gera um segredo aleatório e o hash sha256 (hex) para armazenar.
 * O token puro só viaja no link; o banco guarda apenas o hash (get/accept_invitation
 * recomputam sha256 e comparam). Ver supabase/migrations/*_onboarding_rpcs.sql.
 */
export function generateInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Sufixo curto para desambiguar slugs de escola. */
export function randomSlugSuffix() {
  return randomBytes(3).toString("hex");
}

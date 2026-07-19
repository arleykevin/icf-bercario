import { headers } from "next/headers";

/**
 * URL absoluta do site (para emailRedirectTo do Supabase, etc.). Prefere
 * NEXT_PUBLIC_APP_URL; senão deriva dos headers da requisição.
 */
export async function getSiteURL() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

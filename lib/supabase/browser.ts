import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { clientEnv } from "@/lib/env";

/**
 * Client Supabase para o browser (Client Components). Usa APENAS a anon key + JWT do
 * usuário — toda autorização é aplicada pela RLS no Postgres. Nunca use service_role aqui.
 */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

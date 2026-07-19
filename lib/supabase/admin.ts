import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { clientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * ⚠️ Client com service_role — IGNORA a RLS. Use com extremo cuidado e SOMENTE no
 * servidor (Route Handlers / Server Actions), para operações que legitimamente precisam
 * de privilégio (onboarding de escola, geração de URL assinada após revalidar acesso,
 * rotinas de administração). Toda chamada deve revalidar autorização no código antes de agir.
 *
 * O import de "server-only" garante que este módulo jamais entre no bundle do cliente.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

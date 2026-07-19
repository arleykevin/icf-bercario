import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { clientEnv } from "@/lib/env";

/**
 * Client Supabase para o servidor (Server Components, Route Handlers, Server Actions).
 * Continua limitado pela RLS (anon key + sessão do usuário via cookies). Para operações
 * privilegiadas que precisam ignorar RLS, use `createAdminClient()` de ./admin (server-only).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component (cookies read-only). Ignorável:
            // o middleware é quem renova a sessão nas requisições.
          }
        },
      },
    },
  );
}

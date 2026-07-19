import { z } from "zod";

/**
 * Variáveis de ambiente PÚBLICAS (expostas ao browser). Apenas `NEXT_PUBLIC_*`.
 * NUNCA coloque segredos aqui (service_role, VAPID privada) — ver lib/env.server.ts.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

// Referência literal a cada chave para o Next inlinar no bundle do cliente.
const rawClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

const skip = process.env.SKIP_ENV_VALIDATION === "true";

export const clientEnv = skip
  ? (rawClientEnv as z.infer<typeof clientEnvSchema>)
  : (() => {
      const parsed = clientEnvSchema.safeParse(rawClientEnv);
      if (!parsed.success) {
        console.error(
          "❌ Variáveis NEXT_PUBLIC_* inválidas:",
          parsed.error.flatten().fieldErrors,
        );
        throw new Error(
          "Env do cliente ausente/inválida. Copie .env.example para .env.local e preencha.",
        );
      }
      return parsed.data;
    })();

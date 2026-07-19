import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente SECRETAS — só existem no servidor. O import de "server-only"
 * FALHA o build se este módulo for importado por código que chega ao browser.
 * Regra do projeto: service_role e VAPID privada NUNCA tocam o bundle do cliente.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
});

const rawServerEnv = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
};

const skip = process.env.SKIP_ENV_VALIDATION === "true";

export const serverEnv = skip
  ? (rawServerEnv as z.infer<typeof serverEnvSchema>)
  : (() => {
      const parsed = serverEnvSchema.safeParse(rawServerEnv);
      if (!parsed.success) {
        console.error(
          "❌ Variáveis de ambiente do servidor inválidas:",
          parsed.error.flatten().fieldErrors,
        );
        throw new Error(
          "Env do servidor ausente/inválida. Veja .env.example (SUPABASE_SERVICE_ROLE_KEY etc.).",
        );
      }
      return parsed.data;
    })();

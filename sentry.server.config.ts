import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/observability/scrub";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Nunca enviar dados de requisição/PII a terceiros (LGPD). Ver lib/observability/scrub.ts.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}

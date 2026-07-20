import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

// Serwist ainda não suporta Turbopack; o build usa `--webpack`. No dev (Turbopack) o SW
// fica desabilitado — silencia o aviso informativo do plugin.
process.env.SERWIST_SUPPRESS_TURBOPACK_WARNING ??= "1";

/**
 * Headers de segurança estáticos (PLANO.md §5.2). A CSP estrita baseada em nonce é
 * injetada por requisição no middleware (`lib/supabase/middleware.ts` + `lib/security/csp.ts`),
 * pois o nonce muda a cada request; aqui ficam só os headers constantes.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Trava geolocalização/microfone; câmera liberada só para a própria origem (fotos, Fase 1.1).
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), payment=(), usb=(), camera=(self)",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Em dev o SW atrapalha o HMR; habilitado apenas em produção/preview.
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

const config = withSerwist(nextConfig);

// Só embrulha com Sentry quando há DSN — mantém o build da Fase 0 (sem observabilidade) limpo.
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      // org/project e SENTRY_AUTH_TOKEN vêm da env quando o upload de source maps for ligado.
    })
  : config;

/**
 * Content-Security-Policy estrita baseada em NONCE (PLANO.md §5.2, Fase 2).
 *
 * Por que nonce e não `unsafe-inline`: sem nonce, um XSS conseguiria injetar
 * `<script>` inline. Com `script-src 'nonce-<n>' 'strict-dynamic'`, só executam os
 * scripts que o Next carimba com o nonce da requisição; o `strict-dynamic` propaga a
 * confiança aos chunks que eles carregam (inclui o registro do Service Worker do
 * Serwist e o SDK do Sentry, ambos bundlados e servidos de `'self'`).
 *
 * Este módulo roda no Edge (middleware). Usa apenas Web APIs (`crypto`, `btoa`) —
 * nunca importa `env.server`; o middleware jamais vê segredos.
 */

/**
 * Rota que recebe as violações de CSP (Reporting API / report-uri legado). Precisa
 * ser pública (ver `isPublic` no middleware) e fora do cache do SW.
 */
export const CSP_REPORT_PATH = "/api/csp-report";

/** Nonce aleatório por requisição (16 bytes → base64). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Extrai a origem (`https://host`) de uma URL; `undefined` se inválida/ausente. */
function safeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

type CspOptions = {
  nonce: string;
  isDev: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL — REST/Auth/Storage e URLs assinadas de foto. */
  supabaseUrl?: string;
  /** NEXT_PUBLIC_SENTRY_DSN — o envelope de erro vai para o host de ingest. */
  sentryDsn?: string;
};

/**
 * Monta o valor do header CSP. Em desenvolvimento afrouxa `script-src`
 * (`unsafe-eval`/`unsafe-inline` + `ws:`) porque o HMR do Turbopack usa `eval` e
 * WebSocket; em produção aplica nonce + `strict-dynamic`.
 */
export function buildCsp({
  nonce,
  isDev,
  supabaseUrl,
  sentryDsn,
}: CspOptions): string {
  const supabaseOrigin = safeOrigin(supabaseUrl);
  const supabaseWs = supabaseOrigin?.replace(/^https:/, "wss:");
  const sentryOrigin = safeOrigin(sentryDsn);

  const connectSrc = [
    "'self'",
    supabaseOrigin,
    supabaseWs,
    sentryOrigin,
  ].filter(Boolean) as string[];
  if (isDev) connectSrc.push("ws:", "wss:");

  const imgSrc = ["'self'", "data:", "blob:", supabaseOrigin].filter(
    Boolean,
  ) as string[];

  const scriptSrc = isDev
    ? ["'self'", "'unsafe-eval'", "'unsafe-inline'"]
    : ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    // Estilos: `unsafe-inline` é aceitável (injeção de estilo é baixo risco) e evita
    // ter de nonce-ar o CSS crítico que o Next injeta em streaming + o Tailwind.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": imgSrc,
    "font-src": ["'self'", "data:"],
    "connect-src": connectSrc,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
    // Coleta de violações: `report-to` (moderno, requer header Reporting-Endpoints)
    // + `report-uri` (legado, ainda lido por Safari/Chrome antigos).
    "report-to": ["csp-endpoint"],
    "report-uri": [CSP_REPORT_PATH],
  };

  const parts = Object.entries(directives).map(
    ([key, values]) => `${key} ${values.join(" ")}`,
  );
  // Em produção (enforce), força https em qualquer sub-recurso http:// remanescente.
  if (!isDev) parts.push("upgrade-insecure-requests");

  return parts.join("; ");
}

/**
 * Nome do header — decide entre ENFORÇAR e apenas RELATAR.
 *
 * Default = report-only (não bloqueia nada). Rollout seguro de CSP: publica a
 * política completa, coleta violações via /api/csp-report e só então, depois de
 * validar num preview (sobretudo a hidratação de páginas estáticas como /login sob
 * `strict-dynamic`), liga o enforce com `CSP_ENFORCE=true`.
 */
export function cspHeaderName(): string {
  return process.env.CSP_ENFORCE === "true"
    ? "content-security-policy"
    : "content-security-policy-report-only";
}

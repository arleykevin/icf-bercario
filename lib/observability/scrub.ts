import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Scrubbing de PII para o Sentry. REQUISITO LGPD (art. 11/14): jamais enviar a terceiros
 * dado sensível de menor (saúde, nome, documento, conteúdo do diário). Este `beforeSend`
 * roda em client, server e edge. Ver PLANO.md §5.2 e §7.
 *
 * Estratégia: remover corpos de requisição, cookies, query strings, e redigir qualquer
 * campo cujo nome bata com a denylist — em profundidade.
 */
const PII_KEY_PATTERNS = [
  /nome|name/i,
  /email|e-mail/i,
  /phone|telefone|celular/i,
  /cpf|rg|documento|document/i,
  /allerg|alerg/i, // alergias
  /medic|medicament/i,
  /diaper|fralda|evacua/i,
  /temperat|febre/i,
  /health|saude|saúde|medical|médic/i,
  /note|nota|descri|observ/i,
  /photo|foto|avatar|image/i,
  /token|secret|password|senha|authorization|cookie/i,
  /ip_address|user_agent/i,
];

const REDACTED = "[redacted]";

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = PII_KEY_PATTERNS.some((re) => re.test(k))
        ? REDACTED
        : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  // Remove dados de usuário identificáveis — mantém só um id opaco, se houver.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  if (event.request) {
    delete event.request.data; // corpo da requisição
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers["cookie"];
      delete event.request.headers["authorization"];
    }
    if (event.request.query_string) event.request.query_string = REDACTED;
    // Remove querystring da URL
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }

  if (event.extra)
    event.extra = redactDeep(event.extra) as Record<string, unknown>;
  if (event.contexts)
    event.contexts = redactDeep(event.contexts) as typeof event.contexts;

  // Breadcrumbs podem carregar payloads — redige os dados de cada um.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? (redactDeep(b.data) as Record<string, unknown>) : b.data,
    }));
  }

  return event;
}

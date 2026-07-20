import { NextResponse } from "next/server";

/**
 * Coletor de violações de CSP (Reporting API moderna via `report-to` e `report-uri`
 * legado). Roda em Node, sem cache (o SW já é NetworkOnly em /api).
 *
 * PRIVACIDADE: loga o MÍNIMO — só a diretiva violada e a ORIGEM do recurso
 * bloqueado. NUNCA a URL completa (document-uri/blocked-uri podem carregar query
 * com token de convite ou identificadores). Sempre responde 204.
 */
export const dynamic = "force-dynamic";

function originOnly(uri: unknown): string {
  if (typeof uri !== "string" || uri.length === 0) return "";
  try {
    return new URL(uri).origin;
  } catch {
    return uri.split("?")[0] ?? "";
  }
}

type CspReportBody = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json();
    // `report-to` manda um array de { type, body }; `report-uri` manda { "csp-report": {...} }.
    const reports: unknown[] = Array.isArray(raw) ? raw : [raw];

    for (const entry of reports) {
      const e = (entry ?? {}) as CspReportBody;
      const cr = (e.body ?? e["csp-report"] ?? e) as CspReportBody;
      const directive =
        cr["effective-directive"] ??
        cr["violated-directive"] ??
        cr["effectiveDirective"] ??
        "desconhecida";
      const blocked = originOnly(cr["blocked-uri"] ?? cr["blockedURL"]);
      console.warn(`[csp] violação: diretiva=${directive} origem=${blocked}`);
    }
  } catch {
    // Corpo inválido/ausente — ignora silenciosamente.
  }

  return new NextResponse(null, { status: 204 });
}

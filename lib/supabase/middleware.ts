import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import {
  buildCsp,
  cspHeaderName,
  CSP_REPORT_PATH,
  generateNonce,
} from "@/lib/security/csp";

/**
 * Renova a sessão do Supabase a cada requisição, aplica um guard de rota básico e
 * injeta a CSP estrita por nonce (Fase 2). Roda no middleware (Edge). NÃO importa
 * env.server — o middleware nunca vê secrets; usa só `NEXT_PUBLIC_*`.
 *
 * A nonce entra em DOIS lugares: no header da REQUISIÇÃO (o Next lê a CSP dali para
 * carimbar seus próprios <script>) e no header da RESPOSTA (o browser a aplica).
 */
export async function updateSession(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  const responseCspHeader = cspHeaderName();

  // Headers repassados ao render (SSR/RSC): carregam a nonce e a CSP. O nome do header
  // da REQUISIÇÃO é sempre `content-security-policy` (não o `-report-only`), porque é
  // dele que o Next extrai a nonce para carimbar seus <script> — inclusive em modo
  // report-only, para que os próprios scripts do Next não virem falso-positivo.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  // Só o header da RESPOSTA alterna entre enforce e report-only (o browser só
  // enforça o que vem na resposta). O Reporting-Endpoints liga a diretiva
  // `report-to` ao coletor de violações.
  const applyCsp = (res: NextResponse) => {
    res.headers.set(responseCspHeader, csp);
    res.headers.set(
      "reporting-endpoints",
      `csp-endpoint="${request.nextUrl.origin}${CSP_REPORT_PATH}"`,
    );
    return res;
  };

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem credenciais (build/preview sem env) não há o que autenticar — mas a CSP vai junto.
  if (!url || !anon) return applyCsp(supabaseResponse);

  const supabase = createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        // Re-sincroniza o Cookie no clone que será encaminhado ao render ATUAL. Sem
        // isto, o refresh token rotacionado pelo Supabase não chega aos Server
        // Components deste mesmo request, e a detecção de reuso pode deslogar o
        // usuário na virada de expiração do token.
        requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
        supabaseResponse = NextResponse.next({
          request: { headers: requestHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: chamar getUser() logo após criar o client renova o token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/convite") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith(CSP_REPORT_PATH) ||
    pathname.startsWith("/offline");

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return applyCsp(NextResponse.redirect(redirectUrl));
  }

  return applyCsp(supabaseResponse);
}

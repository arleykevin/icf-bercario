import { NextResponse } from "next/server";

// Runtime Node (não Edge): rotas privilegiadas do app usam crypto/service_role.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "icf-bercario",
    time: new Date().toISOString(),
  });
}

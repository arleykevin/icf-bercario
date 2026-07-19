import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Convenção "proxy" do Next 16 (substitui "middleware"). Roda na borda a cada requisição.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, EXCETO assets estáticos, imagens do Next, ícones, o próprio
     * service worker e o manifest — para não interceptar o que é servido publicamente.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    /*
     * SEGURANÇA (PLANO.md §5.2): NUNCA cachear dado sensível no dispositivo — sobretudo
     * em tablets compartilhados de sala. Toda rota de API/dados vai por rede, sem cache.
     * Rotas de saúde/foto/chat na Fase 1 herdam esta regra.
     */
    {
      matcher: ({ url }) => url.pathname.startsWith("/api"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

// --- Web Push (Fase 3) ---------------------------------------------------------
// Payload SEMPRE genérico (o remetente nunca manda PII). Ao clicar, foca/abre o app.
type PushPayload = { title?: string; body?: string; url?: string };

self.addEventListener("push", (event) => {
  let payload: PushPayload = {
    title: "Instituto Cinthia França",
    body: "Nova atualização no diário.",
    url: "/inicio",
  };
  try {
    if (event.data)
      payload = { ...payload, ...(event.data.json() as PushPayload) };
  } catch {
    // corpo ausente/inválido — usa o genérico.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Atualização", {
      body: payload.body ?? "",
      tag: "icf",
      data: { url: payload.url ?? "/inicio" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data as { url?: string } | undefined)?.url ?? "/inicio";
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsArr) {
        if ("focus" in client) {
          await client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});

serwist.addEventListeners();

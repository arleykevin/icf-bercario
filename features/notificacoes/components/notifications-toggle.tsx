"use client";

import { useEffect, useState } from "react";
import { clientEnv } from "@/lib/env";
import { deletePushSubscription, savePushSubscription } from "../actions";

type State = "loading" | "unsupported" | "off" | "on" | "denied";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Liga/desliga as notificações push do aparelho. Só aparece se o navegador suporta
 * e há chave VAPID pública configurada. O SW cuida de exibir a notificação genérica.
 */
export function NotificationsToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const vapid = clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !vapid
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vapid]);

  async function enable() {
    if (!vapid) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const json = sub.toJSON();
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      setState(res.error ? "off" : "on");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      // ignora
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  if (state === "denied") {
    return (
      <p className="text-muted text-sm">
        As notificações estão bloqueadas nas configurações do navegador.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted text-sm">
        Receba um aviso quando houver novidade (sem dados sensíveis na
        notificação).
      </p>
      <button
        type="button"
        onClick={state === "on" ? disable : enable}
        disabled={busy}
        className={[
          "inline-flex min-h-[var(--touch-min)] w-fit items-center rounded-[var(--radius-lg)] px-4 text-sm font-medium disabled:opacity-60",
          state === "on"
            ? "border-border text-foreground border"
            : "bg-brand text-brand-foreground",
        ].join(" ")}
      >
        {busy
          ? "…"
          : state === "on"
            ? "🔕 Desativar notificações"
            : "🔔 Ativar notificações"}
      </button>
    </div>
  );
}

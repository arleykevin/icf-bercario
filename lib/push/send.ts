import "server-only";
import webpush from "web-push";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envio de Web Push (server-only). Payload SEMPRE genérico — nunca PII/saúde. Sem
 * chaves VAPID configuradas, é NO-OP (a infra fica pronta; as chaves e o canal de
 * fallback entram depois). Poda assinaturas mortas (404/410).
 */

let configured: boolean | null = null;
function ensureVapid(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = serverEnv.VAPID_PRIVATE_KEY;
  const subject = serverEnv.VAPID_SUBJECT || "mailto:contato@example.com";
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Envia a mesma notificação genérica a todos os dispositivos dos perfis dados. */
export async function sendPushToProfiles(
  profileIds: string[],
  payload: PushPayload,
): Promise<void> {
  const ids = [...new Set(profileIds)].filter(Boolean);
  if (ids.length === 0 || !ensureVapid()) return;

  const admin = createAdminClient();
  const { data } = await admin
    .from("push_devices")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", ids);
  const devices = (data ?? []) as {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  const body = JSON.stringify(payload);

  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          body,
        );
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_devices").delete().eq("id", d.id);
        }
      }
    }),
  );
}

/**
 * Notifica os responsáveis do escopo de um comunicado (turma ou escola inteira)
 * com payload genérico. Usa service_role para resolver os responsáveis (o remetente
 * pode não ter visibilidade RLS de todos).
 */
export async function notifyGuardiansOfComm(
  organizationId: string,
  classId: string | null,
): Promise<void> {
  if (!ensureVapid()) return;
  const admin = createAdminClient();

  let guardianIds: string[] = [];
  if (classId) {
    const { data: enr } = await admin
      .from("enrollments")
      .select("child_id")
      .eq("class_id", classId)
      .eq("status", "active")
      .is("deleted_at", null);
    const childIds = (enr ?? []).map((e: { child_id: string }) => e.child_id);
    if (childIds.length === 0) return;
    const { data: g } = await admin
      .from("guardianships")
      .select("guardian_id")
      .in("child_id", childIds)
      .is("deleted_at", null);
    guardianIds = (g ?? []).map((x: { guardian_id: string }) => x.guardian_id);
  } else {
    const { data: kids } = await admin
      .from("children")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    const childIds = (kids ?? []).map((c: { id: string }) => c.id);
    if (childIds.length === 0) return;
    const { data: g } = await admin
      .from("guardianships")
      .select("guardian_id")
      .in("child_id", childIds)
      .is("deleted_at", null);
    guardianIds = (g ?? []).map((x: { guardian_id: string }) => x.guardian_id);
  }

  await sendPushToProfiles(guardianIds, {
    title: "Instituto Cinthia França",
    body: "Novo comunicado da escola.",
    url: "/comunicados",
  });
}

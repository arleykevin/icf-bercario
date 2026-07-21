"use server";

import { createClient } from "@/lib/supabase/server";

export type PushSub = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

/** Salva a assinatura de push do dispositivo do usuário (RLS: profile = self). */
export async function savePushSubscription(
  sub: PushSub,
): Promise<{ error?: string }> {
  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return { error: "Assinatura inválida." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.from("push_devices").upsert(
    {
      profile_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: "Não foi possível ativar as notificações." };
  return {};
}

/** Remove a assinatura (ao desativar). */
export async function deletePushSubscription(
  endpoint: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  await supabase.from("push_devices").delete().eq("endpoint", endpoint);
  return {};
}

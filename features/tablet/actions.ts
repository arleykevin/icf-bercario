"use server";

import { createClient } from "@/lib/supabase/server";
import { hashIdentifier, rateLimit } from "@/lib/security/rate-limit";

export type PinState = { error?: string; message?: string };

/** Define/atualiza o PIN de bloqueio do tablet do próprio usuário. */
export async function setPin(
  _prev: PinState,
  formData: FormData,
): Promise<PinState> {
  const pin = String(formData.get("pin") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!/^[0-9]{4,8}$/.test(pin)) {
    return { error: "O PIN deve ter de 4 a 8 dígitos." };
  }
  if (pin !== confirm) {
    return { error: "Os PINs não conferem." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.rpc("set_my_pin", { p_pin: pin });
  if (error) return { error: "Não foi possível salvar o PIN." };
  return { message: "PIN salvo. O tablet vai travar sozinho quando ocioso." };
}

/** Remove o PIN do próprio usuário. */
export async function clearPin(): Promise<PinState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.rpc("clear_my_pin");
  if (error) return { error: "Não foi possível remover o PIN." };
  return { message: "PIN removido." };
}

/**
 * Confere o PIN do próprio usuário (desbloqueio da tela). A trava de tentativas do
 * overlay é só de UX; o limite REAL é este rate limit server-side por usuário —
 * senão quem tem o cookie de sessão poderia forçar bruta os 10 mil PINs de 4
 * dígitos direto no RPC.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  if (!/^[0-9]{4,8}$/.test(pin)) return false;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const gate = await rateLimit(
    "pin_verify",
    hashIdentifier(user.id),
    10,
    5 * 60,
  );
  if (!gate.allowed) return false;

  const { data, error } = await supabase.rpc("verify_my_pin", { p_pin: pin });
  if (error) return false;
  return data === true;
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type OffboardState = { error?: string; message?: string };

/** Admin muda o papel de um membro (autorização/guard do último admin no RPC). */
export async function setMemberRole(
  membershipId: string,
  newRole: string,
): Promise<OffboardState> {
  if (newRole !== "admin" && newRole !== "teacher" && newRole !== "staff") {
    return { error: "Papel inválido." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.rpc("set_member_role", {
    p_membership_id: membershipId,
    p_new_role: newRole,
  });
  if (error) {
    const safe = error.code === "P0001" || error.code === "42501";
    return { error: safe ? error.message : "Não foi possível mudar o papel." };
  }
  revalidatePath("/gestao");
  return { message: "Papel atualizado." };
}

/**
 * Remove o acesso de um membro à escola. A autorização real acontece no RPC
 * `offboard_member` (SECURITY DEFINER, exige is_org_admin, trava o último admin e
 * grava auditoria). Se a pessoa não tiver mais vínculo em nenhuma escola, o RPC
 * desativa o profile e aqui banimos a conta (revoga sessões/refresh) — defesa em
 * profundidade, já que a RLS revogou a autorização no ato.
 */
export async function offboardMember(
  organizationId: string,
  profileId: string,
): Promise<OffboardState> {
  if (!organizationId || !profileId) return { error: "Dados inválidos." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  if (user.id === profileId) {
    return { error: "Você não pode remover o próprio acesso." };
  }

  const { data, error } = await supabase.rpc("offboard_member", {
    p_org: organizationId,
    p_profile: profileId,
  });
  if (error) {
    // Só as mensagens que NÓS levantamos (P0001/42501) são seguras de exibir;
    // qualquer outro erro do Postgres vira mensagem genérica.
    const safe = error.code === "P0001" || error.code === "42501";
    return {
      error: safe
        ? error.message
        : "Não foi possível remover o acesso. Tente novamente.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.fully_offboarded && row?.target) {
    // Offboarding total → revoga a sessão (ban). O DESFECHO vai para a auditoria
    // imutável e, se falhar, o admin é avisado (sessão pode levar até ~1h p/ expirar).
    let banOk = false;
    try {
      const admin = createAdminClient();
      const { error: banError } = await admin.auth.admin.updateUserById(
        String(row.target),
        { ban_duration: "876000h" },
      );
      banOk = !banError;
    } catch {
      banOk = false;
    }
    try {
      await supabase.rpc("record_offboard_ban", {
        p_org: organizationId,
        p_profile: profileId,
        p_ok: banOk,
      });
    } catch {
      // registro é best-effort; não bloqueia o offboarding.
    }
    if (!banOk) {
      console.warn(`[offboarding] ban da conta falhou para ${row.target}`);
      revalidatePath("/gestao");
      return {
        message:
          "Acesso removido. A conta não pôde ser bloqueada agora — a sessão " +
          "existente pode levar até 1h para expirar.",
      };
    }
  }

  revalidatePath("/gestao");
  return { message: "Acesso removido." };
}

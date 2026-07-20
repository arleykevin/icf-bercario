"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";
import { generateInviteToken } from "@/lib/tokens";
import { inviteSchema } from "./schema";

export type InviteState = { error?: string; inviteUrl?: string };

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Admin cria um convite. A RLS (invitations_admin_insert) exige is_org_admin da org
 * e invited_by = auth.uid(); a FK composta garante que childId (se houver) é da org.
 * Retorna o link para o admin compartilhar (o token puro só existe aqui).
 */
export async function createInvitation(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const parsed = inviteSchema.safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
    role: formData.get("role"),
    childId: formData.get("childId") || undefined,
    relationship: formData.get("relationship") || undefined,
    isLegalGuardian: formData.get("isLegalGuardian") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { token, tokenHash } = generateInviteToken();
  const childId =
    parsed.data.childId && parsed.data.childId !== ""
      ? parsed.data.childId
      : null;

  const { error } = await supabase.from("invitations").insert({
    organization_id: parsed.data.organizationId,
    email: parsed.data.email,
    role: parsed.data.role,
    child_id: childId,
    relationship: parsed.data.relationship ?? null,
    is_legal_guardian: parsed.data.isLegalGuardian ?? false,
    token_hash: tokenHash,
    invited_by: user.id,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });
  if (error) {
    return {
      error:
        "Não foi possível criar o convite. Confirme que você é admin desta escola.",
    };
  }

  const siteUrl = await getSiteURL();
  revalidatePath("/gestao");
  return { inviteUrl: `${siteUrl}/convite/${token}` };
}

/**
 * Aceita um convite (RPC atômica accept_invitation, que valida token + e-mail do usuário).
 * Form action simples: redireciona conforme o resultado.
 */
export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/convite/${encodeURIComponent(token)}`);
  }

  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    redirect(`/convite/${encodeURIComponent(token)}?erro=1`);
  }

  revalidatePath("/", "layout");
  redirect("/inicio");
}

/**
 * Aceite DENTRO do app: assume os convites pendentes que casam com o e-mail
 * verificado do usuário (RPC accept_invitation_by_email). Usado no /inicio para quem
 * foi convidado — não depende do link nem de e-mail enviado.
 */
export async function acceptMyInvitations() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.rpc("accept_invitation_by_email");

  revalidatePath("/", "layout");
  redirect("/inicio");
}

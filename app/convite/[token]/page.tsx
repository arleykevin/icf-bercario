import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation } from "@/features/convites/actions";
import { ROLE_LABELS, isAppRole } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Convite",
};

export default async function ConvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { token } = await params;
  const { erro } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation", { p_token: token });
  const inv = Array.isArray(data) ? data[0] : data;

  if (!inv) {
    return (
      <Shell>
        <h1 className="text-foreground text-2xl font-semibold">
          Convite inválido
        </h1>
        <p className="text-muted text-sm">
          Este convite não existe, já foi usado ou expirou. Peça um novo à
          escola.
        </p>
      </Shell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const invRole: unknown = inv.role;
  const roleLabel = isAppRole(invRole) ? ROLE_LABELS[invRole] : String(invRole);
  const emailMatches =
    !!user?.email &&
    user.email.toLowerCase() === String(inv.email).toLowerCase();

  return (
    <Shell>
      <div className="flex flex-col gap-1.5">
        <span className="bg-brand-soft text-brand w-fit rounded-full px-3 py-1 text-sm font-medium">
          Convite
        </span>
        <h1 className="text-foreground text-2xl font-semibold">
          {inv.organization_name}
        </h1>
        <p className="text-muted text-sm">
          Você foi convidado(a) como <strong>{roleLabel}</strong>
          {inv.child_name ? (
            <>
              {" "}
              de <strong>{inv.child_name}</strong>
            </>
          ) : null}
          .
        </p>
      </div>

      {erro ? (
        <p role="alert" className="text-critical text-sm">
          Não foi possível aceitar o convite. Verifique se entrou com o e-mail{" "}
          <strong>{inv.email}</strong>.
        </p>
      ) : null}

      {!user ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted text-sm">
            Entre com o e-mail <strong>{inv.email}</strong> para aceitar.
          </p>
          <Link
            href={`/login?next=/convite/${encodeURIComponent(token)}`}
            className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium"
          >
            Entrar
          </Link>
        </div>
      ) : emailMatches ? (
        <form action={acceptInvitation}>
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] w-full items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium"
          >
            Aceitar convite
          </button>
        </form>
      ) : (
        <p role="alert" className="text-critical text-sm">
          Este convite é para <strong>{inv.email}</strong>, mas você está logado
          como {user.email}. Saia e entre com o e-mail correto.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      {children}
    </main>
  );
}

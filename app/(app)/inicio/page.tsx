import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, isAppRole } from "@/lib/auth/roles";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { acceptMyInvitations } from "@/features/convites/actions";

type PendingInvite = {
  invitation_id: string;
  organization_name: string;
  role: string;
  child_name: string | null;
};

export const metadata: Metadata = {
  title: "Início",
};

type Membership = { role: string; organization_id: string };

export default async function InicioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;

  const [{ data: profile }, { data: membershipsData }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
    supabase
      .from("org_members")
      .select("role, organization_id")
      .eq("profile_id", uid)
      .eq("is_active", true),
  ]);

  const memberships = (membershipsData ?? []) as Membership[];
  const adminOrgIds = memberships
    .filter((m) => m.role === "admin")
    .map((m) => m.organization_id);

  // Convites pendentes para o e-mail (verificado) do usuário — quem foi convidado
  // aceita aqui mesmo, sem precisar do link/e-mail.
  const { data: pendingData } = await supabase.rpc("my_pending_invitations");
  const pendingInvites = (pendingData ?? []) as PendingInvite[];

  // Filhos (responsável) e turmas lecionadas (professor) em paralelo.
  const [{ data: guardKids }, { data: taughtLinks }] = await Promise.all([
    supabase
      .from("guardianships")
      .select("child_id")
      .eq("guardian_id", uid)
      .is("deleted_at", null),
    supabase
      .from("class_teachers")
      .select("class_id")
      .eq("teacher_id", uid)
      .is("deleted_at", null),
  ]);

  // Turmas das escolas que administro.
  let adminClasses: { id: string; name: string }[] = [];
  if (adminOrgIds.length) {
    const { data } = await supabase
      .from("classes")
      .select("id, name")
      .in("organization_id", adminOrgIds)
      .is("deleted_at", null);
    adminClasses = (data ?? []) as { id: string; name: string }[];
  }

  // Nomes das crianças do responsável.
  const childIds = (guardKids ?? []).map(
    (g: { child_id: string }) => g.child_id,
  );
  let children: { id: string; full_name: string }[] = [];
  if (childIds.length) {
    const { data } = await supabase
      .from("children")
      .select("id, full_name")
      .in("id", childIds)
      .is("deleted_at", null)
      .order("full_name");
    children = (data ?? []) as { id: string; full_name: string }[];
  }

  // Turmas: as que leciono + as da(s) escola(s) que administro (dedupe por id).
  const classes = new Map<string, string>();
  for (const c of adminClasses) {
    classes.set(c.id, c.name);
  }
  const taughtIds = (taughtLinks ?? []).map(
    (t: { class_id: string }) => t.class_id,
  );
  const missing = taughtIds.filter((id) => !classes.has(id));
  if (missing.length) {
    const { data } = await supabase
      .from("classes")
      .select("id, name")
      .in("id", missing)
      .is("deleted_at", null);
    for (const c of (data ?? []) as { id: string; name: string }[]) {
      classes.set(c.id, c.name);
    }
  }
  const classList = [...classes.entries()].map(([id, name]) => ({ id, name }));

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "Bem-vindo(a)";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground text-2xl font-semibold">
            Olá, {firstName}
          </h1>
          <p className="text-muted text-sm">Bem-vindo(a) de volta 🌿</p>
        </div>
        <SignOutButton />
      </header>

      {pendingInvites.length > 0 ? (
        <section
          aria-labelledby="convite-heading"
          className="border-brand bg-brand-soft flex flex-col gap-3 rounded-[var(--radius-lg)] border p-6"
        >
          <h2
            id="convite-heading"
            className="text-foreground text-base font-semibold"
          >
            Convite pendente
          </h2>
          <ul className="flex flex-col gap-1">
            {pendingInvites.map((inv) => (
              <li key={inv.invitation_id} className="text-foreground text-sm">
                <strong>{inv.organization_name}</strong> —{" "}
                {isAppRole(inv.role) ? ROLE_LABELS[inv.role] : inv.role}
                {inv.child_name ? (
                  <>
                    {" "}
                    de <strong>{inv.child_name}</strong>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          <form action={acceptMyInvitations}>
            <button
              type="submit"
              className="bg-brand text-brand-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Aceitar convite
            </button>
          </form>
        </section>
      ) : null}

      {memberships.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/calendario"
            className="border-border bg-surface hover:border-brand inline-flex min-h-[var(--touch-min)] items-center gap-2 rounded-[var(--radius-lg)] border px-4 text-sm font-medium"
          >
            📅 Calendário
          </Link>
          <Link
            href="/comunicados"
            className="border-border bg-surface hover:border-brand inline-flex min-h-[var(--touch-min)] items-center gap-2 rounded-[var(--radius-lg)] border px-4 text-sm font-medium"
          >
            📣 Comunicados
          </Link>
        </div>
      ) : null}

      {children.length > 0 ? (
        <section
          aria-labelledby="filhos-heading"
          className="flex flex-col gap-3"
        >
          <h2
            id="filhos-heading"
            className="text-foreground text-base font-semibold"
          >
            Seus filhos
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {children.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/crianca/${c.id}`}
                  className="border-border bg-surface hover:border-brand flex min-h-[var(--touch-min)] items-center gap-3 rounded-[var(--radius-lg)] border p-3"
                >
                  <span
                    aria-hidden
                    className="bg-brand-soft flex size-9 items-center justify-center rounded-full"
                  >
                    👶
                  </span>
                  <span className="text-foreground text-sm font-medium">
                    {c.full_name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {classList.length > 0 ? (
        <section
          aria-labelledby="turmas-heading"
          className="flex flex-col gap-3"
        >
          <h2
            id="turmas-heading"
            className="text-foreground text-base font-semibold"
          >
            Suas turmas
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {classList.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/turma/${c.id}`}
                  className="border-border bg-surface hover:border-brand flex min-h-[var(--touch-min)] items-center gap-3 rounded-[var(--radius-lg)] border p-3"
                >
                  <span
                    aria-hidden
                    className="bg-brand-soft flex size-9 items-center justify-center rounded-full"
                  >
                    🧸
                  </span>
                  <span className="text-foreground text-sm font-medium">
                    {c.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {adminOrgIds.length > 0 ? (
        <section
          aria-labelledby="gestao-heading"
          className="flex flex-col gap-3"
        >
          <h2
            id="gestao-heading"
            className="text-foreground text-base font-semibold"
          >
            Gestão
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/gestao"
              className="border-border bg-surface hover:border-brand inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--radius-lg)] border px-4 text-sm font-medium"
            >
              Cadastrar crianças e convidar
            </Link>
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="vinculos-heading"
        className="border-border bg-surface rounded-[var(--radius-lg)] border p-6"
      >
        <h2
          id="vinculos-heading"
          className="text-foreground text-base font-semibold"
        >
          Seus vínculos
        </h2>
        {memberships.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {memberships.map((m, i) => (
              <li
                key={i}
                className="text-foreground flex items-center justify-between text-sm"
              >
                <span>Escola</span>
                <span className="bg-brand-soft text-brand rounded-full px-3 py-0.5 text-xs font-medium">
                  {isAppRole(m.role) ? ROLE_LABELS[m.role] : m.role}
                </span>
              </li>
            ))}
          </ul>
        ) : pendingInvites.length > 0 ? (
          <p className="text-muted mt-3 text-sm">
            Você tem um convite pendente acima — aceite para ver sua turma ou
            seus filhos aqui.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-muted text-sm">
              Você ainda não tem vínculo com nenhuma escola. Se você é da{" "}
              <strong>gestão</strong>, crie a sua escola para começar. Se foi
              convidado(a), abra o link que a escola enviou.
            </p>
            <Link
              href="/onboarding"
              className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium"
            >
              Criar escola
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

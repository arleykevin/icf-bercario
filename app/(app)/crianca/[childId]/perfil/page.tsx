import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  HealthForm,
  type HealthInitial,
} from "@/features/perfil/components/health-form";
import {
  PickupsManager,
  type Pickup,
} from "@/features/perfil/components/pickups-manager";

export const metadata: Metadata = {
  title: "Perfil da criança",
};

export default async function PerfilPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("children")
    .select("id, organization_id, full_name, birth_date")
    .eq("id", childId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!child) notFound();

  const orgId = child.organization_id as string;

  const [
    { data: isAdmin },
    { data: isGuard },
    { data: isLegal },
    { data: health },
    { data: pickupsData },
    { data: guardsData },
  ] = await Promise.all([
    supabase.rpc("is_org_admin", { target_org: orgId }),
    supabase.rpc("is_guardian_of", { target_child: childId }),
    supabase.rpc("is_legal_guardian_of", { target_child: childId }),
    supabase
      .from("child_health")
      .select("blood_type, allergies, dietary_restrictions, medical_notes")
      .eq("child_id", childId)
      .maybeSingle(),
    supabase
      .from("authorized_pickups")
      .select("id, name, relationship, phone")
      .eq("child_id", childId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("guardianships")
      .select("guardian_id, relationship, is_legal_guardian")
      .eq("child_id", childId)
      .is("deleted_at", null),
  ]);

  const canEditHealth = isAdmin === true || isGuard === true;
  const canManagePickups = isAdmin === true || isLegal === true;
  const healthData = (health ?? null) as HealthInitial;
  const pickups = (pickupsData ?? []) as Pickup[];

  // Nomes dos responsáveis (RLS de profiles permite co-responsável/professor/admin).
  const guards = (guardsData ?? []) as {
    guardian_id: string;
    relationship: string;
    is_legal_guardian: boolean;
  }[];
  const guardianNames: Record<string, string> = {};
  if (guards.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in(
        "id",
        guards.map((g) => g.guardian_id),
      );
    for (const p of (profs ?? []) as { id: string; full_name: string }[]) {
      guardianNames[p.id] = p.full_name;
    }
  }

  const firstName = String(child.full_name).split(" ")[0];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/crianca/${childId}`} className="text-muted w-fit text-sm">
          ← Diário de {firstName}
        </Link>
        <h1 className="text-foreground text-2xl font-semibold">
          Perfil de {String(child.full_name)}
        </h1>
      </header>

      {/* Saúde */}
      <section className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-lg)] border p-5">
        <h2 className="text-foreground text-base font-semibold">Saúde</h2>
        {canEditHealth ? (
          <HealthForm childId={childId} data={healthData} />
        ) : (
          <dl className="flex flex-col gap-2 text-sm">
            <HealthRow label="Tipo sanguíneo" value={healthData?.blood_type} />
            <HealthRow label="Alergias" value={healthData?.allergies} />
            <HealthRow
              label="Restrições alimentares"
              value={healthData?.dietary_restrictions}
            />
            <HealthRow
              label="Observações médicas"
              value={healthData?.medical_notes}
            />
          </dl>
        )}
      </section>

      {/* Autorizados a retirar */}
      <section className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-lg)] border p-5">
        <h2 className="text-foreground text-base font-semibold">
          Autorizados a retirar
        </h2>
        <PickupsManager
          childId={childId}
          pickups={pickups}
          canManage={canManagePickups}
        />
      </section>

      {/* Responsáveis */}
      <section className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-lg)] border p-5">
        <h2 className="text-foreground text-base font-semibold">
          Responsáveis
        </h2>
        {guards.length === 0 ? (
          <p className="text-muted text-sm">
            Nenhum responsável vinculado ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {guards.map((g) => (
              <li
                key={g.guardian_id}
                className="text-foreground flex items-center justify-between text-sm"
              >
                <span>
                  {guardianNames[g.guardian_id] ?? "Responsável"}
                  <span className="text-muted"> · {g.relationship}</span>
                </span>
                {g.is_legal_guardian ? (
                  <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-xs">
                    Responsável legal
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function HealthRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-foreground">{value?.trim() || "—"}</dd>
    </div>
  );
}

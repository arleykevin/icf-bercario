"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Mode = "loading" | "enroll" | "challenge" | "error";

/** QR do Supabase pode vir como data-URL ou como SVG cru; normaliza para <img>. */
function toDataUrl(qr: string): string {
  if (qr.startsWith("data:")) return qr;
  return `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`;
}

/**
 * Cadastro (enroll) e verificação (challenge) de MFA TOTP. Se o admin ainda não tem
 * fator, mostra o QR + segredo para o app autenticador; se já tem, pede só o código
 * para elevar a sessão a AAL2. A verificação é 100% no Supabase Auth.
 */
export function MfaFlow({ next }: { next: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: factors, error: fErr } =
        await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (fErr) {
        setError("Não foi possível carregar o MFA.");
        setMode("error");
        return;
      }
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setMode("challenge");
        return;
      }
      // Remove fatores não verificados pendentes (evita erro ao reenrolar).
      for (const f of factors?.totp ?? []) {
        if (f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error: eErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "ICF Berçário",
      });
      if (cancelled) return;
      if (eErr || !data) {
        setError("Não foi possível iniciar o cadastro do MFA.");
        setMode("error");
        return;
      }
      setFactorId(data.id);
      setSecret(data.totp.secret);
      setQr(toDataUrl(data.totp.qr_code));
      setMode("enroll");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (cErr || !ch) {
      setError("Falha ao iniciar o desafio. Tente de novo.");
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.id,
      code: code.trim(),
    });
    if (vErr) {
      setError("Código incorreto. Confira o app autenticador.");
      setCode("");
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (mode === "loading") {
    return <p className="text-muted text-sm">Carregando…</p>;
  }
  if (mode === "error") {
    return (
      <p role="alert" className="text-critical text-sm">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {mode === "enroll" ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted text-sm">
            Abra seu app autenticador (Google Authenticator, Authy, etc.),
            escaneie o código e digite o número gerado.
          </p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QR code para configurar o MFA"
              width={180}
              height={180}
              className="bg-surface rounded-[var(--radius-lg)] border p-2"
            />
          ) : null}
          {secret ? (
            <p className="text-muted text-xs">
              Ou digite manualmente:{" "}
              <code className="text-foreground break-all">{secret}</code>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted text-sm">
          Digite o código do seu app autenticador para confirmar sua identidade.
        </p>
      )}

      <form onSubmit={submit} className="flex max-w-xs flex-col gap-3">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Código de verificação"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="000000"
          className="border-border bg-surface text-foreground min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 text-center text-xl tracking-[0.4em]"
        />
        {error ? (
          <p role="alert" className="text-critical text-sm">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || code.length < 6}
          className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium disabled:opacity-60"
        >
          {busy ? "Verificando…" : "Confirmar"}
        </button>
      </form>
    </div>
  );
}

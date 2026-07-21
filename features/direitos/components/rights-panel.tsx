"use client";

import { useActionState, useState, useTransition } from "react";
import {
  exportChildData,
  fileDataRequest,
  type RequestState,
} from "../actions";

export type MyDataRequest = {
  id: string;
  request_type: string;
  status: string;
  note: string | null;
  resolution_note: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Em aberto",
  done: "Concluído",
  rejected: "Recusado",
};
const TYPE_LABEL: Record<string, string> = {
  access: "Acesso aos dados",
  deletion: "Eliminação dos dados",
};

/**
 * Painel de direitos do titular (LGPD art. 18) para o responsável: baixar uma
 * cópia dos dados do filho (acesso/portabilidade) e registrar pedidos de acesso
 * ou eliminação, acompanhando o status.
 */
export function RightsPanel({
  organizationId,
  childId,
  requests,
}: {
  organizationId: string;
  childId: string;
  requests: MyDataRequest[];
}) {
  const [state, action, pending] = useActionState<RequestState, FormData>(
    fileDataRequest,
    {},
  );
  const [exporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);

  function onExport() {
    startExport(async () => {
      setExportError(null);
      const res = await exportChildData(childId);
      if (res.error || !res.json) {
        setExportError(res.error ?? "Não foi possível exportar agora.");
        return;
      }
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName ?? "dados.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted text-sm">
        Você pode baixar uma cópia dos dados do seu filho ou pedir à escola o
        acesso formal ou a eliminação (LGPD).
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="border-border text-foreground inline-flex min-h-[var(--touch-min)] w-fit items-center rounded-[var(--radius-lg)] border px-4 text-sm font-medium disabled:opacity-60"
        >
          {exporting ? "Preparando…" : "⬇️ Baixar cópia dos dados"}
        </button>
        {exportError ? (
          <p role="alert" className="text-critical text-sm">
            {exportError}
          </p>
        ) : null}
      </div>

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="childId" value={childId} />
        <label
          htmlFor="requestType"
          className="text-foreground text-sm font-medium"
        >
          Registrar um pedido
        </label>
        <select
          id="requestType"
          name="requestType"
          defaultValue="access"
          className="border-border bg-surface text-foreground min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4"
        >
          <option value="access">Acesso formal aos dados</option>
          <option value="deletion">Eliminação dos dados</option>
        </select>
        <textarea
          name="note"
          rows={2}
          placeholder="Observação (opcional)"
          className="border-border bg-surface text-foreground min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 py-2"
        />
        {state.error ? (
          <p role="alert" className="text-critical text-sm">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p role="status" className="text-brand text-sm font-medium">
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Enviar pedido"}
        </button>
      </form>

      {requests.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-foreground text-sm font-medium">Seus pedidos</h3>
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="border-border flex flex-col gap-0.5 rounded-[var(--radius-lg)] border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground">
                    {TYPE_LABEL[r.request_type] ?? r.request_type}
                  </span>
                  <span className="text-muted text-xs">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                {r.resolution_note ? (
                  <span className="text-muted text-xs">
                    Resposta: {r.resolution_note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

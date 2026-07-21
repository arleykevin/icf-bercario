"use client";

import { useState, useTransition } from "react";
import { resolveDataRequest } from "../actions";

export type AdminDataRequest = {
  id: string;
  childName: string;
  requesterName: string;
  request_type: string;
  status: string;
  note: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  access: "Acesso aos dados",
  deletion: "Eliminação dos dados",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Em aberto",
  done: "Concluído",
  rejected: "Recusado",
};

/**
 * Lista de pedidos LGPD para o admin/DPO acompanhar e resolver. A eliminação de
 * dados de menor tem retenção legal (saúde/medicamento) → o admin decide caso a
 * caso e registra a resposta.
 */
export function DataRequestsList({
  requests,
}: {
  requests: AdminDataRequest[];
}) {
  if (requests.length === 0) {
    return <p className="text-muted text-sm">Nenhum pedido em aberto.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {requests.map((r) => (
        <RequestRow key={r.id} request={r} />
      ))}
    </ul>
  );
}

function RequestRow({ request }: { request: AdminDataRequest }) {
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resolve(status: "done" | "rejected") {
    startTransition(async () => {
      const res = await resolveDataRequest(request.id, status, note || null);
      setResult(res.error ?? "Pedido atualizado.");
    });
  }

  const resolved = result === "Pedido atualizado.";

  return (
    <li className="border-border bg-surface flex flex-col gap-2 rounded-[var(--radius-lg)] border px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground text-sm font-medium">
          {TYPE_LABEL[request.request_type] ?? request.request_type}
        </span>
        <span className="text-muted text-xs">
          {STATUS_LABEL[request.status] ?? request.status}
        </span>
      </div>
      <p className="text-muted text-xs">
        {request.childName} · solicitado por {request.requesterName}
      </p>
      {request.note ? (
        <p className="text-foreground text-sm">“{request.note}”</p>
      ) : null}

      {resolved ? (
        <p role="status" className="text-muted text-xs">
          {result}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Resposta ao responsável (opcional)"
            className="border-border bg-surface text-foreground min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => resolve("done")}
              disabled={pending}
              className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--radius-lg)] px-4 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Salvando…" : "Marcar como concluído"}
            </button>
            <button
              type="button"
              onClick={() => resolve("rejected")}
              disabled={pending}
              className="border-border text-foreground inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--radius-lg)] border px-4 text-sm font-medium disabled:opacity-60"
            >
              Recusar
            </button>
          </div>
          {result && !resolved ? (
            <p role="alert" className="text-critical text-xs">
              {result}
            </p>
          ) : null}
        </div>
      )}
    </li>
  );
}

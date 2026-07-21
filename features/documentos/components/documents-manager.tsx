"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteDocument, uploadDocument, type DocState } from "../actions";

export type ChildDocument = {
  id: string;
  title: string;
  docType: string;
  storagePath: string;
  url: string | null;
  canDelete: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  vaccine: "Vacina",
  medical: "Laudo/médico",
  authorization: "Autorização",
  other: "Outro",
};

/**
 * Documentos da criança (carteira de vacina, laudos). Responsável e admin enviam
 * (canUpload); download por URL assinada de curta duração; remoção por quem enviou
 * ou admin.
 */
export function DocumentsManager({
  childId,
  documents,
  canUpload,
}: {
  childId: string;
  documents: ChildDocument[];
  canUpload: boolean;
}) {
  const [state, action, pending] = useActionState<DocState, FormData>(
    uploadDocument,
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      {documents.length === 0 ? (
        <p className="text-muted text-sm">Nenhum documento ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((d) => (
            <DocRow key={d.id} childId={childId} doc={d} />
          ))}
        </ul>
      )}

      {canUpload ? (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="childId" value={childId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="title"
              type="text"
              placeholder="Título (ex.: Carteira de vacina)"
              className="border-border bg-surface text-foreground min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 text-sm"
            />
            <select
              name="docType"
              defaultValue="vaccine"
              className="border-border bg-surface text-foreground min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 text-sm"
            >
              <option value="vaccine">Vacina</option>
              <option value="medical">Laudo/médico</option>
              <option value="authorization">Autorização</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <input
            name="file"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="text-muted file:bg-brand-soft file:text-brand text-sm file:mr-3 file:min-h-[var(--touch-min)] file:rounded-[var(--radius-lg)] file:border-0 file:px-4 file:font-medium"
          />
          <span className="text-muted text-xs">
            PDF, JPG, PNG ou WEBP · até 15 MB
          </span>
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
            {pending ? "Enviando…" : "Enviar documento"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function DocRow({ childId, doc }: { childId: string; doc: ChildDocument }) {
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  return (
    <li className="border-border flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="text-foreground truncate text-sm font-medium">
          {doc.title}
        </span>
        <span className="text-muted text-xs">
          {TYPE_LABEL[doc.docType] ?? doc.docType}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {doc.url ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand text-sm font-medium"
          >
            Abrir
          </a>
        ) : null}
        {doc.canDelete ? (
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const res = await deleteDocument(
                  childId,
                  doc.id,
                  doc.storagePath,
                );
                if (!res.error) setRemoved(true);
              })
            }
            disabled={pending}
            aria-label={`Remover ${doc.title}`}
            className="text-muted text-sm disabled:opacity-60"
          >
            {pending ? "…" : "✕"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

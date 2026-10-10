/** Previous and next for a list the server pages. Renders nothing while it all fits on one. */
export function Pager({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-2.5 text-sm text-muted"
    >
      <span>
        Página {page} de {pageCount} · {total} registros
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}

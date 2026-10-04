export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="animate-spin text-action"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/** Placeholder rows for a list or table that is still loading. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-line-subtle" role="status" aria-label="Cargando">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-3 px-5 py-3.5">
          <div className="skeleton h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * A page that is still loading: placeholder blocks in the shape of a header, a row of figures
 * and a list, so the layout does not jump when the data arrives.
 */
export function PageLoader() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="space-y-2">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-40" />
      </div>
      <div className="skeleton h-20 w-full rounded-xl" />
      <ListSkeleton />
    </div>
  );
}

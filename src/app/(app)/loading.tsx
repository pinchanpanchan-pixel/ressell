export default function Loading() {
  return (
    <div className="mt-6 space-y-3" aria-busy="true" aria-label="Cargando">
      <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-card" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-card" />
        <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-card" />
      </div>
      <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-card" />
    </div>
  );
}

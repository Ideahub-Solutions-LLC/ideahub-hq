export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-64 rounded-lg bg-surface-3" />
      <div className="h-4 w-96 max-w-full rounded bg-surface-3" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-32 rounded-2xl bg-surface-2" />
        <div className="h-32 rounded-2xl bg-surface-2" />
        <div className="h-32 rounded-2xl bg-surface-2" />
      </div>
      <div className="h-64 rounded-2xl bg-surface-2" />
    </div>
  );
}

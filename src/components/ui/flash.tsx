import { Notice } from "./card";

/** Renders the ?ok= / ?error= flash set by server actions. */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mb-4">
      {ok && <Notice tone="emerald">{ok}</Notice>}
      {error && <Notice tone="rose">{error}</Notice>}
    </div>
  );
}

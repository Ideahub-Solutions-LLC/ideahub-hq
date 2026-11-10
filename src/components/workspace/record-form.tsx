"use client";
import type { ReactNode } from "react";
/** Normalize the actual submitted native date fields, rather than mirroring date input state. */
export function RecordForm({
  action,
  event,
  children,
}: {
  action: (data: FormData) => Promise<void>;
  event: boolean;
  children: ReactNode;
}) {
  async function submit(data: FormData) {
    if (event)
      for (const [field, local] of [
        ["startAt", "startLocal"],
        ["endAt", "endLocal"],
      ]) {
        const date = new Date(String(data.get(local) ?? ""));
        data.set(
          field,
          Number.isFinite(date.getTime()) ? date.toISOString() : "",
        );
      }
    await action(data);
  }
  return (
    <form
      action={event ? submit : action}
      className="grid gap-4 sm:grid-cols-2"
    >
      {children}
    </form>
  );
}

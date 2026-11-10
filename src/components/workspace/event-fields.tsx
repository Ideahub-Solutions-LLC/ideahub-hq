"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
function localInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function EventFields({ data }: { data?: Record<string, unknown> }) {
  const tz = useSyncExternalStore(subscribe, zone, () => "");
  return (
    <>
      <p className="text-xs text-ink-2 sm:col-span-2">
        Enter times in your browser time zone{tz ? ` (${tz})` : ""}. HQ stores
        exact timestamps. Saving an event does not send invitations.
      </p>
      <input
        type="hidden"
        name="timeZone"
        value={tz || String(data?.timeZone ?? "UTC")}
      />
      <div>
        <label className="label" htmlFor="event-start">
          Start
        </label>
        <input
          className="input"
          key={`start-${tz}`}
          id="event-start"
          name="startLocal"
          type="datetime-local"
          required
          defaultValue={tz ? localInput(data?.startAt as string) : ""}
        />
      </div>
      <div>
        <label className="label" htmlFor="event-end">
          End
        </label>
        <input
          className="input"
          key={`end-${tz}`}
          id="event-end"
          name="endLocal"
          type="datetime-local"
          required
          defaultValue={tz ? localInput(data?.endAt as string) : ""}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="location">
          Location or meeting link
        </label>
        <input
          className="input"
          id="location"
          name="location"
          maxLength={300}
          defaultValue={String(data?.location ?? "")}
        />
      </div>
    </>
  );
}

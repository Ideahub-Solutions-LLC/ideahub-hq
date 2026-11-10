import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { listWorkRecords } from "@/lib/services/workspace-records";
import { listTasks } from "@/lib/services/tasks";
import {
  workContext,
  workUrl,
  type WorkParams,
} from "@/lib/services/workspace-context";
import {
  dateKey,
  eventOnDay,
  eventTime,
  monthGrid,
  validTimeZone,
} from "@/lib/workspace/calendar";
import { Card, CardTitle, PageHeader, EmptyState } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { ScopeBar } from "@/components/workspace/scope-bar";
import { AddAppsButton } from "@/components/workspace/app-catalog";
import { RecordEditor } from "@/components/workspace/record-editor";
export const dynamic = "force-dynamic";
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<WorkParams>;
}) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const scope = workContext(ctx.db, ctx.workspace.id, sp);
  const zone = validTimeZone(sp.zone || process.env.HQ_TIME_ZONE || "UTC");
  const grid = monthGrid(sp.month);
  const events = listWorkRecords(ctx.db, ctx.workspace.id, ["event"], {
    ...scope.scope,
    q: sp.q,
    archived: sp.archived === "1",
  });
  const due = listTasks(ctx.db, ctx.workspace.id).filter(
    (t) =>
      t.dueAt &&
      (!scope.scope.departmentId ||
        t.departmentId === scope.scope.departmentId) &&
      (!scope.scope.employeeId || t.employeeId === scope.scope.employeeId) &&
      (!sp.q || t.title.toLowerCase().includes(sp.q.toLowerCase())),
  );
  const url = (changes: Partial<WorkParams>) =>
    workUrl("/calendar", {
      departmentId: sp.departmentId,
      employeeId: sp.employeeId,
      month: grid.month,
      zone,
      view: sp.view,
      q: sp.q,
      archived: sp.archived,
      ...changes,
    });
  const visibleEvents = events
    .filter((e) =>
      grid.days.some((day) => day.inMonth && eventOnDay(e.data, day.key, zone)),
    )
    .sort((a, b) =>
      String(a.data.startAt).localeCompare(String(b.data.startAt)),
    );
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace / Calendar"
        title="Calendar"
        description="Internal events and task due dates. Calendar connections are configured separately; saving here sends no invitations."
        actions={
          <>
            <AddAppsButton label="Connect calendar" category="calendar" />
            <a className="btn btn-primary" href="#create-event">
              New event
            </a>
          </>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      <ScopeBar
        teams={scope.teams}
        staff={scope.staff}
        departmentId={sp.departmentId}
        employeeId={sp.employeeId}
        q={sp.q}
        hidden={{
          month: grid.month,
          zone,
          view: sp.view,
          archived: sp.archived,
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="btn btn-secondary btn-sm"
            aria-label="Previous month"
            href={url({ month: grid.previous })}
          >
            ←
          </Link>
          <h2 className="text-lg font-semibold">{grid.label}</h2>
          <Link
            className="btn btn-secondary btn-sm"
            aria-label="Next month"
            href={url({ month: grid.next })}
          >
            →
          </Link>
          <Link
            className="btn btn-ghost btn-sm"
            href={url({ month: undefined })}
          >
            Today
          </Link>
        </div>
        <div className="flex gap-2">
          <Link
            className={`btn btn-sm ${sp.view !== "agenda" ? "btn-primary" : "btn-secondary"}`}
            href={url({ view: undefined })}
          >
            Month
          </Link>
          <Link
            className={`btn btn-sm ${sp.view === "agenda" ? "btn-primary" : "btn-secondary"}`}
            href={url({ view: "agenda" })}
          >
            Agenda
          </Link>
          <Link
            className="btn btn-secondary btn-sm"
            href={url({
              view: "agenda",
              archived: sp.archived === "1" ? undefined : "1",
            })}
          >
            {sp.archived === "1" ? "Active events" : "Archived events"}
          </Link>
        </div>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="archived" value={sp.archived ?? ""} />
        <input type="hidden" name="q" value={sp.q ?? ""} />
        <input type="hidden" name="month" value={grid.month} />
        <input type="hidden" name="view" value={sp.view ?? ""} />
        <input
          type="hidden"
          name="departmentId"
          value={sp.departmentId ?? ""}
        />
        <input type="hidden" name="employeeId" value={sp.employeeId ?? ""} />
        <div>
          <label className="label" htmlFor="calendar-zone">
            Display time zone
          </label>
          <input
            className="input"
            id="calendar-zone"
            name="zone"
            list="calendar-zones"
            defaultValue={zone}
            maxLength={80}
          />
          <datalist id="calendar-zones">
            <option value="UTC" />
            <option value="Asia/Manila" />
            <option value="America/New_York" />
            <option value="Europe/London" />
          </datalist>
        </div>
        <button className="btn btn-secondary btn-sm">Apply time zone</button>
      </form>
      {sp.view === "agenda" ? (
        <Card>
          {visibleEvents.length ? (
            <ul className="divide-y divide-line">
              {visibleEvents.map((e) => (
                <li key={e.id} className="py-4">
                  <Link
                    className="font-medium text-accent"
                    href={`/work/records/${e.id}`}
                  >
                    {e.title}
                  </Link>
                  <p className="mt-1 text-sm text-ink-2">
                    {dateKey(String(e.data.startAt), zone)} ·{" "}
                    {eventTime(String(e.data.startAt), zone)}–
                    {eventTime(String(e.data.endAt), zone)} · {zone}
                  </p>
                  <p className="mt-1 text-xs text-ink-3">
                    {String(e.data.location || "Internal event")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No events in this month"
              description="Create an internal event or review task due dates in Month view."
            />
          )}
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Month calendar; scroll horizontally on small screens"
            tabIndex={0}
          >
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 border-b border-line bg-surface-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="p-3 text-center text-xs text-ink-2">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {grid.days.map((day) => (
                  <div
                    key={day.key}
                    className={`min-h-32 min-w-0 border-b border-r border-line p-2 ${day.inMonth ? "" : "bg-surface-2/50 text-ink-3"}`}
                  >
                    <p className="mb-2 text-xs">{day.day}</p>
                    <div className="space-y-1">
                      {events
                        .filter((e) => eventOnDay(e.data, day.key, zone))
                        .map((e) => (
                          <Link
                            key={e.id}
                            className="block break-words rounded-lg bg-accent-soft p-1.5 text-[11px] text-accent"
                            href={`/work/records/${e.id}`}
                          >
                            {eventTime(String(e.data.startAt), zone)} {e.title}
                          </Link>
                        ))}
                      {due
                        .filter((t) => dateKey(t.dueAt!, zone) === day.key)
                        .map((t) => (
                          <Link
                            key={t.id}
                            className="block break-words rounded-lg bg-amber-soft p-1.5 text-[11px] text-amber"
                            href={`/tasks/${t.id}`}
                          >
                            Due · {t.title}
                          </Link>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
      {sp.archived !== "1" && (
        <Card className="scroll-mt-20">
          <div id="create-event">
            <CardTitle>New internal event</CardTitle>
            <RecordEditor
              kind="event"
              teams={scope.teams}
              staff={scope.staff}
              departmentId={sp.departmentId}
              employeeId={sp.employeeId}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

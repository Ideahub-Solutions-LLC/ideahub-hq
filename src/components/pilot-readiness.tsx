import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import type { getPilotReadiness } from "@/lib/services/pilot-readiness";

export function PilotReadiness({ pilot }: { pilot: ReturnType<typeof getPilotReadiness> }) {
  return (
    <Card className="mb-6">
      <CardTitle description="One Operations Coordinator, two supervised draft workflows. These checks reflect local configuration, not approval to launch or connect live services." action={<Badge tone="amber">Draft pilot</Badge>}>
        Operations Coordinator pilot
      </CardTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium text-ink">{pilot.configured} / {pilot.checks.length} configured</span>
        {pilot.employee && <Link href={`/employees/${pilot.employee.id}/workspace`} className="btn btn-primary btn-sm">Open {pilot.employee.name}’s workspace</Link>}
        <Link href="/office" className="btn btn-secondary btn-sm">Open HQ</Link>
        <Link href="/office?view=list" className="text-accent hover:underline">Accessible list</Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ul className="divide-y divide-line">
          {pilot.checks.map((check) => (
            <li key={check.key} className="py-2.5 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={check.href} className="text-sm font-medium text-ink hover:underline">{check.label}</Link>
                <Badge tone={check.configured ? "emerald" : "amber"}>{check.configured ? "Configured" : "Needs attention"}</Badge>
              </div>
              <p className="mt-1 text-xs text-ink-2">{check.detail}</p>
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          {pilot.evidence.map((workflow) => (
            <div key={workflow.key} className="rounded-xl border border-line bg-surface-2 p-4">
              <h3 className="text-sm font-semibold text-ink">{workflow.name}</h3>
              <p className="mt-1 text-xs text-ink-2">{workflow.contract}</p>
              <p className="mt-3 text-xs text-ink-2">{workflow.drafts} awaiting review · {workflow.reviewed} reviewed draft(s)</p>
              {workflow.latestTaskId && <Link href={`/tasks/${workflow.latestTaskId}`} className="mt-2 inline-block text-xs text-accent hover:underline">Inspect latest task and evidence →</Link>}
            </div>
          ))}
          <p className="text-xs text-ink-3">Reviewed drafts are not proof of completed external work. CQL, calendar, live messaging and bounded phone handling still need separate implementation and acceptance gates. Current connectors do not deliver externally.</p>
        </div>
      </div>
    </Card>
  );
}

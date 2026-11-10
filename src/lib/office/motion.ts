import type { OfficeActivity } from "./types";

export function activityMotion(activity: OfficeActivity): "typing" | "reviewing" | "waiting" | "none" {
  if (activity.kind === "working") return activity.stage === "reading" || activity.stage === "checking" || activity.stage === "validating" ? "reviewing" : "typing";
  if (activity.kind === "idle" || activity.kind === "queued") return "waiting";
  return "none";
}

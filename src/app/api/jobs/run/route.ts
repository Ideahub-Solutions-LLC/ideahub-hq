import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { drainJobs } from "@/lib/jobs/worker";

/**
 * Optional external trigger for the job queue (e.g. a cron ping when running serverless).
 * Protected by JOBS_TRIGGER_TOKEN; disabled when the token is not configured.
 */
export async function POST(request: Request) {
  const token = process.env.JOBS_TRIGGER_TOKEN;
  if (!token) return NextResponse.json({ error: "JOBS_TRIGGER_TOKEN is not configured." }, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await drainJobs(getDb(), { limit: 10, workerId: "http-trigger" });
  return NextResponse.json({ processed: results.map((r) => ({ id: r.job.id, kind: r.job.kind, outcome: r.outcome })) });
}

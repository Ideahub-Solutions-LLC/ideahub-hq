import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    getDb().run(sql`select 1`);
    return NextResponse.json({ ok: true, db: "ok", workerMode: process.env.JOB_WORKER_MODE ?? "inline", time: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

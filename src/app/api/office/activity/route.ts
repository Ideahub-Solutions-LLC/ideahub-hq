import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/context";
import { getOfficeSnapshot } from "@/lib/services/office";

export const dynamic = "force-dynamic";
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Sign in to view this workspace." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(getOfficeSnapshot(ctx.db, ctx.workspace.id), { headers: { "Cache-Control": "no-store, private" } });
}

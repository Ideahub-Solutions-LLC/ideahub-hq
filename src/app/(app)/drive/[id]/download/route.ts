import { getWorkspaceContext } from "@/lib/auth/context";
import { readDriveFile } from "@/lib/services/workspace-records";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return new Response("Sign in required.", { status: 401 });
  try {
    const file = readDriveFile(
      ctx.db,
      ctx.workspace.id,
      ctx.user.id,
      (await params).id,
    );
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Content-Length": String(file.bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, private",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return new Response("File not found.", { status: 404 });
  }
}

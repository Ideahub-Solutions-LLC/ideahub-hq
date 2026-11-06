import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError, type ZodType } from "zod";

/**
 * Helpers for server actions: parse a FormData against a zod schema, run the mutation, and
 * redirect back with a small flash message in the query string (works without client JS).
 */
export function flashRedirect(path: string, flash: { ok?: string; error?: string }): never {
  const url = new URL(path, "http://local");
  if (flash.ok) url.searchParams.set("ok", flash.ok);
  if (flash.error) url.searchParams.set("error", flash.error);
  revalidatePath(url.pathname);
  redirect(`${url.pathname}${url.search}`);
}

export function describeError(err: unknown): string {
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  if (err && typeof err === "object" && "digest" in err) throw err; // Next.js redirect/notFound — rethrow
  return (err as Error)?.message ?? "Something went wrong.";
}

export function parseForm<T>(schema: ZodType<T>, data: Record<string, unknown>): T {
  return schema.parse(data);
}

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v ? v : null;
}
export function num(fd: FormData, key: string, fallback: number): number {
  const v = Number(fd.get(key));
  return Number.isFinite(v) ? v : fallback;
}
export function optNum(fd: FormData, key: string): number | null {
  const raw = str(fd, key);
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}
export function list(fd: FormData, key: string): string[] {
  return fd.getAll(key).map(String).filter(Boolean);
}
export function csv(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
export function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on" || fd.get(key) === "true" || fd.get(key) === "1";
}

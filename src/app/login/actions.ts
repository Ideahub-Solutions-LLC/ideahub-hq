"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession, SESSION_COOKIE, WORKSPACE_COOKIE } from "@/lib/auth/session";
import { listMemberships } from "@/lib/auth/membership";
import { recordAudit } from "@/lib/audit";

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1), next: z.string().optional() });

export type LoginState = { error?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({ email: String(formData.get("email") ?? "").trim().toLowerCase(), password: String(formData.get("password") ?? ""), next: String(formData.get("next") ?? "") });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const db = getDb();
  const user = db.select().from(users).where(eq(users.email, parsed.data.email)).get();
  // Constant-ish time: verify against a dummy hash when the user does not exist.
  const ok = user ? verifyPassword(parsed.data.password, user.passwordHash) : verifyPassword(parsed.data.password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  if (!user || !ok) return { error: "Incorrect email or password." };

  const { token, expiresAt } = createSession(db, user.id);
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(expiresAt) });
  const memberships = listMemberships(db, user.id);
  if (memberships[0]) {
    jar.set(WORKSPACE_COOKIE, memberships[0].id, { httpOnly: true, sameSite: "lax", secure, path: "/" });
    recordAudit(db, { workspaceId: memberships[0].id, actorUserId: user.id, action: "auth.login", entityType: "user", entityId: user.id });
  }
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/dashboard";
  redirect(next);
}

export async function logout() {
  const jar = await cookies();
  deleteSession(getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  jar.delete(WORKSPACE_COOKIE);
  redirect("/login");
}

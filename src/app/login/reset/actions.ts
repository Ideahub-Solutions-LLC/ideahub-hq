"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import { resetPassword } from "@/lib/services/authentication";
import { clientAddress } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, WORKSPACE_COOKIE } from "@/lib/auth/session";

export type ResetState = { error?: string; ok?: boolean } | undefined;
const ResetSchema = z.object({ token: z.string().max(100), password: z.string().min(12).max(128), confirmation: z.string().max(128) }).refine((v) => v.password === v.confirmation);

export async function resetPasswordAction(_previous: ResetState, data: FormData): Promise<ResetState> {
  const parsed = ResetSchema.safeParse(Object.fromEntries(["token", "password", "confirmation"].map((key) => [key, String(data.get(key) ?? "")])));
  if (!parsed.success) return { error: "Enter your recovery code and matching passwords of 12–128 characters." };
  try {
    resetPassword(getDb(), { ...parsed.data, address: clientAddress(await headers()) });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to reset password." };
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(WORKSPACE_COOKIE);
  return { ok: true };
}

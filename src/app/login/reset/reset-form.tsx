"use client";
import { useActionState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/ui/button";
import { resetPasswordAction, type ResetState } from "./actions";

export function ResetForm() {
  const [state, action] = useActionState<ResetState, FormData>(resetPasswordAction, undefined);
  if (state?.ok) return <div role="status"><p>Password updated. All previous sessions have been signed out.</p><Link href="/login" className="mt-4 block text-accent hover:underline">Sign in</Link></div>;
  return <form action={action} className="space-y-4">
    <div><label className="label" htmlFor="token">Recovery code</label><input className="input" id="token" name="token" autoComplete="off" required maxLength={100} /></div>
    <div><label className="label" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></div>
    <div><label className="label" htmlFor="confirmation">Confirm password</label><input className="input" id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></div>
    {state?.error && <p role="alert" className="text-sm text-rose">{state.error}</p>}
    <SubmitButton pendingText="Updating…">Reset password</SubmitButton>
  </form>;
}

"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { issueRecoveryAction, type RecoveryState } from "../actions";

export function RecoveryForm({ memberId, name }: { memberId: string; name: string }) {
  const [state, action] = useActionState<RecoveryState, FormData>(issueRecoveryAction.bind(null, memberId), undefined);
  return <form action={action} className="mt-2 space-y-2">
    <SubmitButton size="sm" variant="secondary" pendingText="Creating…">Recovery code for {name}</SubmitButton>
    {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    {state?.token && <div role="status" className="max-w-xs text-xs text-ink-2"><p>Verify identity before sharing privately. Enter at /login/reset within 30 minutes. This code is shown only here; generate another if lost.</p><code className="block break-all select-all">{state.token}</code></div>}
  </form>;
}

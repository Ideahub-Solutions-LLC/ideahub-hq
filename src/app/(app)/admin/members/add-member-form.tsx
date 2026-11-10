"use client";
import { useActionState } from "react";
import { WORKSPACE_ROLES } from "@/db/schema";
import { SubmitButton } from "@/components/ui/button";
import { addMemberAction, type AddMemberState } from "../actions";

export function AddMemberForm({ isOwner }: { isOwner: boolean }) {
  const [state, action] = useActionState<AddMemberState, FormData>(addMemberAction, undefined);
  return <form action={action} className="space-y-3">
    <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required className="input" /></div>
    <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" /></div>
    <div><label className="label" htmlFor="role">Role</label><select id="role" name="role" defaultValue="member" className="select">{WORKSPACE_ROLES.filter((r) => r !== "owner" || isOwner).map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
    <SubmitButton>Add member</SubmitButton>
    {state?.error && <p role="alert" className="text-sm text-rose">{state.error}</p>}
    {state?.ok && <div role="status" className="text-sm text-ink-2"><p>{state.ok}</p>{state.password ? <><p>Temporary password — share privately. Shown only here; use recovery if lost.</p><code className="block break-all select-all">{state.password}</code></> : <p>The existing account keeps its password.</p>}</div>}
    <p className="hint">No email is sent. New accounts receive a temporary password; existing accounts keep their credentials.</p>
  </form>;
}

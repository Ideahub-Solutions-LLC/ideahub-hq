"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { SubmitButton } from "@/components/ui/button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(login, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@company.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-rose-soft px-3 py-2 text-sm text-rose" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton className="w-full justify-center" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

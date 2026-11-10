import Link from "next/link";
import { ResetForm } from "./reset-form";

export default function ResetPage() {
  return <main className="flex min-h-dvh items-center justify-center p-6"><div className="w-full max-w-md space-y-5">
    <h1 className="text-2xl font-semibold">Recover your account</h1>
    <p className="text-sm text-ink-2">Ask your workspace owner or administrator to verify your identity and provide a recovery code. Codes expire after 30 minutes. Owner and admin accounts require an owner. No email is sent by this pilot.</p>
    <div className="card p-6"><ResetForm /></div>
    <Link href="/login" className="block text-sm text-accent hover:underline">Back to sign in</Link>
  </div></main>;
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/context";
import { LoginForm } from "./login-form";
import { COMPANY_NAME, PRODUCT_NAME } from "@/lib/branding";
import { DEMO_USERS } from "@/db/demo-users";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const { next } = await searchParams;
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_LOGINS === "1";
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md anim-rise">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-lg font-semibold text-canvas">{COMPANY_NAME.charAt(0)}</div>
          <h1 className="text-2xl font-semibold">{PRODUCT_NAME}</h1>
          <p className="mt-1 text-sm text-ink-2">Sign in to your digital headquarters.</p>
        </div>
        <div className="card p-6">
          <LoginForm next={next} />
        </div>
        {showDemo && (
          <div className="mt-6 rounded-2xl border border-dashed border-line-strong p-4 text-xs text-ink-2">
            <p className="font-medium text-ink">Fictional demo accounts (seeded)</p>
            <p className="mt-1">Password is the value of <code className="kbd">SEED_DEMO_PASSWORD</code> (default <code className="kbd">change-me-demo</code>).</p>
            <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {DEMO_USERS.map((u) => (
                <li key={u.email} className="flex justify-between gap-2">
                  <span>{u.email}</span>
                  <span className="text-ink-3">{u.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

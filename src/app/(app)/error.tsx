"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const forbidden = /permission|forbidden/i.test(error.message);
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold text-ink">{forbidden ? "You do not have permission for that" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-ink-2">{error.message || "An unexpected error occurred."}</p>
      {error.digest && <p className="mt-1 text-xs text-ink-3">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={reset} className="btn btn-secondary">Try again</button>
        <Link href="/dashboard" className="btn btn-primary">Back to dashboard</Link>
      </div>
    </div>
  );
}

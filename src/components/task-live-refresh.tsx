"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function TaskLiveRefresh({ running }: { running: boolean }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => { if (!pending && document.visibilityState === "visible") transition(() => router.refresh()); }, 2000);
    return () => clearInterval(timer);
  }, [running, pending, router]);
  return running ? <p className="mb-4 text-xs text-ink-3" role="status">Run activity updates every two seconds while this page is visible.</p> : null;
}

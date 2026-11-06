import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold text-ink">Not found</h1>
      <p className="mt-2 text-sm text-ink-2">That record does not exist in this workspace, or you do not have access to it.</p>
      <Link href="/dashboard" className="btn btn-primary mt-6">Back to dashboard</Link>
    </div>
  );
}

import Link from "next/link";

export default function RootNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <Link href="/dashboard" className="btn btn-primary mt-4">Go to dashboard</Link>
      </div>
    </main>
  );
}

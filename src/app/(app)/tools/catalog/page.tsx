import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { APP_CATEGORIES, type AppCategory } from "@/lib/workspace/app-catalog";
import { AppCatalog } from "@/components/workspace/app-catalog";
import { PageHeader } from "@/components/ui/card";
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireWorkspace();
  const sp = await searchParams;
  const category = APP_CATEGORIES.includes(sp.category as AppCategory)
    ? (sp.category as AppCategory)
    : "all";
  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/tools">Tools & apps</Link>}
        title="App catalog"
        description="Find an app, review its requested access and save a setup for the organization, a team or an employee."
      />
      <AppCatalog initialCategory={category} />
    </div>
  );
}

import { LinkTabs } from "@/components/ui/card";

export function KnowledgeTabs({ current, counts }: { current: "/knowledge" | "/skills" | "/memory"; counts?: { memory?: number } }) {
  return (
    <LinkTabs
      tabs={[
        { href: "/knowledge", label: "Knowledge sources" },
        { href: "/skills", label: "Skills" },
        { href: "/memory", label: "Memory review", count: counts?.memory },
      ]}
      current={current}
    />
  );
}

export const APP_CATEGORIES = [
  "all",
  "tasks",
  "storage",
  "calendar",
  "crm",
  "mail",
  "communication",
  "custom",
] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];
export type CatalogApp = {
  key: string;
  name: string;
  category: AppCategory;
  summary: string;
  connectorKey?: string;
  scopes: readonly string[];
  color: string;
};
export const APP_CATALOG: readonly CatalogApp[] = [
  {
    key: "teams",
    name: "Microsoft Teams",
    category: "communication",
    summary: "Plan a team communication connection and review employee access.",
    connectorKey: "teams",
    scopes: ["read", "draft", "send"],
    color: "violet",
  },
  {
    key: "outlook",
    name: "Outlook Mail",
    category: "mail",
    summary: "Set up the shared mailbox account your team intends to connect.",
    scopes: ["read", "draft", "send"],
    color: "blue",
  },
  {
    key: "gmail",
    name: "Gmail",
    category: "mail",
    summary: "Organize account ownership and requested mailbox permissions.",
    scopes: ["read", "draft", "send"],
    color: "rose",
  },
  {
    key: "email",
    name: "Email / SMTP",
    category: "mail",
    summary:
      "Configure the existing email adapter and review its current mode.",
    connectorKey: "email",
    scopes: ["draft", "send"],
    color: "amber",
  },
  {
    key: "google-drive",
    name: "Google Drive",
    category: "storage",
    summary: "Prepare access to team files alongside the built-in Drive.",
    scopes: ["read", "write"],
    color: "emerald",
  },
  {
    key: "onedrive",
    name: "OneDrive",
    category: "storage",
    summary: "Prepare a Microsoft storage connection for your team.",
    scopes: ["read", "write"],
    color: "blue",
  },
  {
    key: "sharepoint",
    name: "SharePoint",
    category: "storage",
    summary: "Track ownership and scope for shared company documents.",
    scopes: ["read", "write"],
    color: "teal",
  },
  {
    key: "dropbox",
    name: "Dropbox",
    category: "storage",
    summary: "Prepare an external file-storage connection.",
    scopes: ["read", "write"],
    color: "blue",
  },
  {
    key: "google-calendar",
    name: "Google Calendar",
    category: "calendar",
    summary:
      "Prepare calendar access; internal HQ events remain available separately.",
    scopes: ["read", "write"],
    color: "blue",
  },
  {
    key: "outlook-calendar",
    name: "Outlook Calendar",
    category: "calendar",
    summary: "Prepare scheduling access for a Microsoft account.",
    scopes: ["read", "write"],
    color: "violet",
  },
  {
    key: "task-system",
    name: "Task system",
    category: "tasks",
    summary:
      "Use the current task-system adapter and inspect its simulated receipts.",
    connectorKey: "task_system",
    scopes: ["read", "write"],
    color: "teal",
  },
  {
    key: "asana",
    name: "Asana",
    category: "tasks",
    summary: "Prepare task-tool ownership and requested access.",
    scopes: ["read", "write"],
    color: "rose",
  },
  {
    key: "clickup",
    name: "ClickUp",
    category: "tasks",
    summary: "Prepare a team task-tool connection.",
    scopes: ["read", "write"],
    color: "violet",
  },
  {
    key: "linear",
    name: "Linear",
    category: "tasks",
    summary: "Prepare access to issue and project records.",
    scopes: ["read", "write"],
    color: "slate",
  },
  {
    key: "ghl",
    name: "CQL / GoHighLevel",
    category: "crm",
    summary: "Review CRM connection setup and the existing adapter status.",
    connectorKey: "ghl",
    scopes: ["read", "write", "send"],
    color: "amber",
  },
  {
    key: "hubspot",
    name: "HubSpot",
    category: "crm",
    summary: "Prepare a customer-record connection alongside native HQ CRM.",
    scopes: ["read", "write"],
    color: "amber",
  },
  {
    key: "slack",
    name: "Slack",
    category: "communication",
    summary:
      "Review the current Slack adapter, scopes and simulated execution.",
    connectorKey: "slack",
    scopes: ["read", "send"],
    color: "violet",
  },
  {
    key: "zoom",
    name: "Zoom",
    category: "communication",
    summary: "Prepare meeting-source access and review the planned adapter.",
    connectorKey: "zoom",
    scopes: ["read"],
    color: "blue",
  },
  {
    key: "custom-mcp",
    name: "Custom MCP server",
    category: "custom",
    summary:
      "Connect a trusted endpoint, approve discovery and review its tool definitions.",
    scopes: ["discover"],
    color: "teal",
  },
];
export function catalogApp(key: string) {
  const app = APP_CATALOG.find((a) => a.key === key);
  if (!app) throw new Error("App is not in this catalog.");
  return app;
}
export const CATEGORY_LABEL: Record<AppCategory, string> = {
  all: "All apps",
  tasks: "Task tools",
  storage: "Storage",
  calendar: "Calendars",
  crm: "CRM & sales",
  mail: "Email",
  communication: "Communication",
  custom: "Custom tools",
};

CREATE TABLE `employee_briefs` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`body` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`endpoint` text NOT NULL,
	`credential_env_var` text,
	`enabled` integer DEFAULT false NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`owner_user_id` text NOT NULL,
	`tools` text NOT NULL,
	`discovery_status` text NOT NULL,
	`discovery_config_version` integer,
	`discovered_at` text,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mcp_tool_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`server_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`tool_hash` text NOT NULL,
	`server_config_version` integer NOT NULL,
	`policy` text NOT NULL,
	`status` text NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_grant_employee_tool` ON `mcp_tool_grants` (`workspace_id`,`employee_id`,`server_id`,`tool_name`);--> statement-breakpoint
CREATE TABLE `provider_catalogs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`models` text NOT NULL,
	`status` text NOT NULL,
	`credential_fingerprint` text NOT NULL,
	`detail` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_ws_provider` ON `provider_catalogs` (`workspace_id`,`provider`);
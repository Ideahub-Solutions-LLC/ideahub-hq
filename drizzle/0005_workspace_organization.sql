CREATE TABLE `app_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_key` text NOT NULL,
	`scope_key` text NOT NULL,
	`department_id` text,
	`employee_id` text,
	`owner_user_id` text NOT NULL,
	`account_label` text NOT NULL,
	`requested_scopes` text NOT NULL,
	`mcp_server_id` text,
	`status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mcp_server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_installation_scope` ON `app_installations` (`workspace_id`,`app_key`,`scope_key`);--> statement-breakpoint
CREATE TABLE `drive_blobs` (
	`record_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`bytes` blob NOT NULL,
	`size_bytes` integer NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `work_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `work_records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`department_id` text,
	`employee_id` text,
	`created_by_user_id` text NOT NULL,
	`parent_id` text,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_records_scope` ON `work_records` (`workspace_id`,`kind`,`department_id`,`employee_id`);
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`job_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`heartbeat_at` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`reserved_cost_cents` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_job_attempt` ON `workflow_runs` (`job_id`,`attempt`);--> statement-breakpoint
CREATE INDEX `run_workspace_task` ON `workflow_runs` (`workspace_id`,`task_id`);
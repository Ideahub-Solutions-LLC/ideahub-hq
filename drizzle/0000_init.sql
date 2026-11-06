CREATE TABLE `action_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`approval_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`connector_key` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`external_ref` text,
	`result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_receipts_idempotency_key_unique` ON `action_receipts` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text,
	`employee_id` text,
	`artifact_id` text,
	`action_type` text NOT NULL,
	`title` text NOT NULL,
	`destination` text NOT NULL,
	`connector_key` text,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`context` text NOT NULL,
	`status` text NOT NULL,
	`requested_by_employee_id` text,
	`decided_by_user_id` text,
	`decision_note` text,
	`idempotency_key` text NOT NULL,
	`expires_at` text,
	`requested_at` text NOT NULL,
	`decided_at` text,
	`executed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approvals_idempotency_key_unique` ON `approvals` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `appr_ws_status` ON `approvals` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text,
	`employee_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `art_task` ON `artifacts` (`task_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_user_id` text,
	`actor_employee_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`data` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_ws_time` ON `audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`period` text NOT NULL,
	`limit_cents` integer NOT NULL,
	`alert_threshold_pct` integer DEFAULT 80 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_scope` ON `budgets` (`workspace_id`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `communication_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connector_key` text,
	`employee_id` text,
	`task_id` text,
	`approval_id` text,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`counterpart` text,
	`subject` text,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comm_ws` ON `communication_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `connector_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`scopes` text NOT NULL,
	`granted_by_user_id` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `grant_emp` ON `connector_grants` (`employee_id`);--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`owner_user_id` text,
	`scopes` text NOT NULL,
	`permissions` text NOT NULL,
	`status_detail` text NOT NULL,
	`credential_env_vars` text NOT NULL,
	`last_checked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conn_ws_key` ON `connectors` (`workspace_id`,`key`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`purpose` text NOT NULL,
	`manager_user_id` text,
	`color` text NOT NULL,
	`layout` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dept_ws_slug` ON `departments` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `employee_knowledge` (
	`employee_id` text NOT NULL,
	`knowledge_source_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`employee_id`, `knowledge_source_id`),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`knowledge_source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `employee_skills` (
	`employee_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`employee_id`, `skill_id`),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`department_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`role_title` text NOT NULL,
	`status` text NOT NULL,
	`seniority` text NOT NULL,
	`manager_user_id` text,
	`avatar_seed` text NOT NULL,
	`bio` text NOT NULL,
	`personality` text NOT NULL,
	`authority` text NOT NULL,
	`model_config` text NOT NULL,
	`channels` text NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`is_pilot` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emp_ws_slug` ON `employees` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE INDEX `emp_ws_status` ON `employees` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_after` text NOT NULL,
	`locked_at` text,
	`locked_by` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_status_run` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`department_id` text,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`source_ref` text,
	`owner_user_id` text,
	`review_status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_verified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ks_ws` ON `knowledge_sources` (`workspace_id`,`review_status`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`proposal_id` text,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`source_ref` text NOT NULL,
	`scope` text NOT NULL,
	`approved_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposal_id`) REFERENCES `memory_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mem_emp` ON `memories` (`employee_id`);--> statement-breakpoint
CREATE TABLE `memory_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`task_id` text,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`source_ref` text NOT NULL,
	`status` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mp_ws_status` ON `memory_proposals` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`task_id` text,
	`author_type` text NOT NULL,
	`author_id` text,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `msg_emp` ON `messages` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `skill_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`version` integer NOT NULL,
	`instructions` text NOT NULL,
	`inputs` text NOT NULL,
	`outputs` text NOT NULL,
	`required_tools` text NOT NULL,
	`required_approvals` text NOT NULL,
	`review_status` text NOT NULL,
	`change_note` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sv_skill_version` ON `skill_versions` (`skill_id`,`version`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`purpose` text NOT NULL,
	`workflow_key` text,
	`owner_user_id` text,
	`status` text NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_ws_slug` ON `skills` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `te_task` ON `task_events` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text NOT NULL,
	`seq` integer NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`checkpoint` text,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `steps_task` ON `task_steps` (`task_id`,`seq`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`employee_id` text,
	`department_id` text,
	`title` text NOT NULL,
	`objective` text NOT NULL,
	`status` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`owner_user_id` text,
	`requested_by_user_id` text,
	`workflow_key` text,
	`input` text NOT NULL,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`next_action` text,
	`blocked_reason` text,
	`due_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_ws_status` ON `tasks` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_emp` ON `tasks` (`employee_id`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`employee_id` text,
	`task_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`meter` text NOT NULL,
	`input_units` integer DEFAULT 0 NOT NULL,
	`output_units` integer DEFAULT 0 NOT NULL,
	`unit` text NOT NULL,
	`estimated_cost_cents` integer,
	`cost_status` text NOT NULL,
	`event_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_events_event_key_unique` ON `usage_events` (`event_key`);--> statement-breakpoint
CREATE INDEX `usage_ws_time` ON `usage_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wm_ws_user` ON `workspace_members` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);
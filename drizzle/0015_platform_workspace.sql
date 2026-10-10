ALTER TABLE agencies ADD COLUMN is_platform boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE agencies SET is_platform = true WHERE slug = 'datamine';
--> statement-breakpoint
DELETE FROM memberships USING users WHERE memberships.user_id = users.id AND users.platform_role = 'admin';

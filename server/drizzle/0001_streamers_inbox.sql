CREATE TYPE "public"."publish_policy" AS ENUM('immediately', 'aired');--> statement-breakpoint
CREATE TYPE "public"."topic_mode" AS ENUM('board', 'inbox');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected', 'aired');--> statement-breakpoint
CREATE TYPE "public"."transcription_job_status" AS ENUM('queued', 'leased', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "streamers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"login_key_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"overlay_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "streamers_login_key_hash_unique" UNIQUE("login_key_hash"),
	CONSTRAINT "streamers_overlay_token_hash_unique" UNIQUE("overlay_token_hash")
);
--> statement-breakpoint
CREATE TABLE "transcription_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"status" "transcription_job_status" DEFAULT 'queued' NOT NULL,
	"worker_id" text,
	"lease_token_hash" text,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcription_jobs_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"engine" text NOT NULL,
	"model" text,
	"language" text,
	"text" text NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"risk_flags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_key" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "mode" "topic_mode" DEFAULT 'board' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "publish_on" "publish_policy" DEFAULT 'immediately' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "transcribe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "review_status" "review_status";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "queue_order" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "aired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "aired_ref" text;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcription_jobs_status_idx" ON "transcription_jobs" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_owner_id_streamers_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."streamers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_review_idx" ON "posts" USING btree ("review_status","created_at");
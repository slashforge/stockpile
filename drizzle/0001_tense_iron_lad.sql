CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"publisher" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"image_url" text,
	"image_credit" text,
	"connections" jsonb NOT NULL,
	"provenance" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stories_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
CREATE INDEX "stories_published_id_idx" ON "stories" USING btree ("published_at","id");
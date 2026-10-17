CREATE TABLE "cramer_articles" (
	"url" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cramer_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"article_url" text NOT NULL,
	"ticker" text NOT NULL,
	"stance" text NOT NULL,
	"said_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"quote" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cramer_articles_published_idx" ON "cramer_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "cramer_calls_said_idx" ON "cramer_calls" USING btree ("said_at");--> statement-breakpoint
CREATE INDEX "cramer_calls_ticker_idx" ON "cramer_calls" USING btree ("ticker","said_at");
CREATE TABLE "congress_disclosures" (
	"id" text PRIMARY KEY NOT NULL,
	"member" text NOT NULL,
	"chamber" text NOT NULL,
	"ticker" text NOT NULL,
	"txn_type" text NOT NULL,
	"txn_date" timestamp with time zone NOT NULL,
	"disclosed_date" timestamp with time zone NOT NULL,
	"amount_range" text NOT NULL,
	"amount_low" numeric(16, 2) NOT NULL,
	"amount_high" numeric(16, 2) NOT NULL,
	"asset" text NOT NULL,
	"filing_url" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"mint" text NOT NULL,
	"usd_price" numeric(20, 8) NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	CONSTRAINT "price_snapshots_mint_ts_pk" PRIMARY KEY("mint","ts")
);
--> statement-breakpoint
CREATE INDEX "congress_disclosures_ticker_txn_idx" ON "congress_disclosures" USING btree ("ticker","txn_date");--> statement-breakpoint
CREATE INDEX "congress_disclosures_member_idx" ON "congress_disclosures" USING btree ("member");--> statement-breakpoint
CREATE INDEX "price_snapshots_ts_idx" ON "price_snapshots" USING btree ("ts");
CREATE TABLE "bag_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bag_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"mint" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"token_amount" text NOT NULL,
	"decimals" integer NOT NULL,
	"usdc_amount" text NOT NULL,
	"signature" text NOT NULL,
	"slot" bigint,
	"block_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bag_lots_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
ALTER TABLE "bag_lots" ADD CONSTRAINT "bag_lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bag_lots_user_bag_idx" ON "bag_lots" USING btree ("user_id","bag_id");
ALTER TABLE "saved_baskets" RENAME TO "saved_bags";--> statement-breakpoint
ALTER TABLE "saved_bags" RENAME COLUMN "basket_id" TO "bag_id";--> statement-breakpoint
ALTER TABLE "saved_bags" DROP CONSTRAINT "saved_baskets_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "saved_bags" DROP CONSTRAINT "saved_baskets_user_id_basket_id_pk";--> statement-breakpoint
ALTER TABLE "saved_bags" ADD CONSTRAINT "saved_bags_user_id_bag_id_pk" PRIMARY KEY("user_id","bag_id");--> statement-breakpoint
ALTER TABLE "saved_bags" ADD CONSTRAINT "saved_bags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Data migration: story connections stored the bag reference as "basketId"; rename the JSON key to "bagId".
UPDATE "stories" SET "connections" = (
	SELECT COALESCE(jsonb_agg((c - 'basketId') || jsonb_build_object('bagId', c->'basketId')), '[]'::jsonb)
	FROM jsonb_array_elements("connections") AS c
) WHERE "connections" @> '[]'::jsonb AND EXISTS (SELECT 1 FROM jsonb_array_elements("connections") AS c WHERE c ? 'basketId');

CREATE TYPE "public"."entry_type" AS ENUM('gasto', 'abastecimento', 'ideia', 'tarefa', 'nota');--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "briefings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content" text NOT NULL,
	"had_image" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" "entry_type" NOT NULL,
	"raw_text" text NOT NULL,
	"amount_cents" integer,
	"category" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"due_date" date,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_amount_non_negative" CHECK ("entries"."amount_cents" >= 0),
	CONSTRAINT "entries_gasto_has_amount" CHECK ("entries"."type" <> 'gasto' or "entries"."amount_cents" is not null)
);
--> statement-breakpoint
CREATE TABLE "fuel_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fuel_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entry_id" bigint NOT NULL,
	"total_cents" integer NOT NULL,
	"liters" numeric(7, 3),
	"odometer_km" integer,
	"price_per_liter_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_logs_entry_id_unique" UNIQUE("entry_id"),
	CONSTRAINT "fuel_logs_total_positive" CHECK ("fuel_logs"."total_cents" > 0),
	CONSTRAINT "fuel_logs_liters_positive" CHECK ("fuel_logs"."liters" > 0),
	CONSTRAINT "fuel_logs_odometer_non_negative" CHECK ("fuel_logs"."odometer_km" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefings_sent_at_idx" ON "briefings" USING btree ("sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_created_at_idx" ON "entries" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_type_created_at_idx" ON "entries" USING btree ("type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_tags_idx" ON "entries" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "fuel_logs_created_at_idx" ON "fuel_logs" USING btree ("created_at" DESC NULLS LAST);
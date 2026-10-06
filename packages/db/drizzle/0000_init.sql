CREATE TABLE "etl_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"series_id" integer NOT NULL,
	"date" date NOT NULL,
	"value" numeric(20, 8) NOT NULL,
	CONSTRAINT "observations_series_id_date_pk" PRIMARY KEY("series_id","date")
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"periodicity" text NOT NULL,
	CONSTRAINT "series_source_code_uq" UNIQUE("source","code")
);
--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;
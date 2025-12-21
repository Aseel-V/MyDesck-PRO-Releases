-- Add attachments column to trips table
ALTER TABLE "public"."trips" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb;

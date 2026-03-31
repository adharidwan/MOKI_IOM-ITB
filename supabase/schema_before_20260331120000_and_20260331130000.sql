


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."csv_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "no_telp" "text" NOT NULL,
    "nama" "text" NOT NULL,
    "jenis_kelamin" "text" NOT NULL,
    "jabatan" "text",
    "source_file" "text",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."csv_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid",
    "author" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sender_type" "text" DEFAULT 'admin'::"text",
    "delivery_status" "text" DEFAULT 'not_applicable'::"text",
    "delivery_attempts" integer DEFAULT 0,
    "next_retry_at" timestamp with time zone,
    "last_delivery_error" "text",
    "whatsapp_message_id" "text",
    "delivered_at" timestamp with time zone
);


ALTER TABLE "public"."replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'Open'::"text",
    "user_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "channel" "text" DEFAULT 'web'::"text",
    "phone_number" "text",
    "whatsapp_chat_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_contacts" (
    "phone_number" "text" NOT NULL,
    "chat_id" "text" NOT NULL,
    "invalid_message_count" integer DEFAULT 0 NOT NULL,
    "last_message_preview" "text",
    "last_help_sent_at" timestamp with time zone,
    "last_inbound_at" timestamp with time zone DEFAULT "now"(),
    "last_ticket_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whatsapp_contacts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."csv_contacts"
    ADD CONSTRAINT "csv_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."replies"
    ADD CONSTRAINT "replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("phone_number");



CREATE INDEX "idx_csv_contacts_imported_at" ON "public"."csv_contacts" USING "btree" ("imported_at");



CREATE UNIQUE INDEX "idx_csv_contacts_no_telp" ON "public"."csv_contacts" USING "btree" ("no_telp");



CREATE INDEX "replies_delivery_status_idx" ON "public"."replies" USING "btree" ("delivery_status", "next_retry_at");



CREATE INDEX "replies_ticket_created_at_idx" ON "public"."replies" USING "btree" ("ticket_id", "created_at");



CREATE INDEX "tickets_channel_idx" ON "public"."tickets" USING "btree" ("channel");



CREATE INDEX "tickets_phone_number_idx" ON "public"."tickets" USING "btree" ("phone_number");



CREATE INDEX "tickets_whatsapp_chat_id_idx" ON "public"."tickets" USING "btree" ("whatsapp_chat_id");



ALTER TABLE ONLY "public"."replies"
    ADD CONSTRAINT "replies_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_last_ticket_id_fkey" FOREIGN KEY ("last_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE "public"."csv_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "replies_service_role_all" ON "public"."replies" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "tickets_service_role_all" ON "public"."tickets" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "whatsapp_contacts_service_role_all" ON "public"."whatsapp_contacts" TO "service_role" USING (true) WITH CHECK (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."csv_contacts" TO "anon";
GRANT ALL ON TABLE "public"."csv_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."csv_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."replies" TO "anon";
GRANT ALL ON TABLE "public"."replies" TO "authenticated";
GRANT ALL ON TABLE "public"."replies" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








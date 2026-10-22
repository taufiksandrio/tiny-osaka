CREATE TABLE "cms_auth"."mcp_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"client_id" text,
	"event" text NOT NULL,
	"tool" text,
	"target" text,
	"outcome" text NOT NULL,
	"code" text,
	"request_id" text,
	CONSTRAINT "mcp_audit_event" CHECK ("cms_auth"."mcp_audit"."event" IN ('client_created','client_disabled','authorize_approved','authorize_denied','authorize_rejected','code_issued','code_replay','token_issued','token_refreshed','token_revoked','reuse_detected','tool_call','request_denied','rate_limited','family_revoked')),
	CONSTRAINT "mcp_audit_outcome" CHECK ("cms_auth"."mcp_audit"."outcome" IN ('ok','denied','error')),
	CONSTRAINT "mcp_audit_lengths" CHECK (char_length(coalesce("cms_auth"."mcp_audit"."target",'')) <= 200 AND char_length(coalesce("cms_auth"."mcp_audit"."code",'')) <= 64 AND char_length(coalesce("cms_auth"."mcp_audit"."tool",'')) <= 64)
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"auth_method" text DEFAULT 'none' NOT NULL,
	"created_by" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "oauth_client_public_only" CHECK ("cms_auth"."oauth_clients"."auth_method" = 'none'),
	CONSTRAINT "oauth_client_name" CHECK (char_length("cms_auth"."oauth_clients"."name") BETWEEN 1 AND 80),
	CONSTRAINT "oauth_client_redirects" CHECK (cardinality("cms_auth"."oauth_clients"."redirect_uris") BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."oauth_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"family_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"challenge_method" text NOT NULL,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_code_s256" CHECK ("cms_auth"."oauth_codes"."challenge_method" = 'S256' AND "cms_auth"."oauth_codes"."code_challenge" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "oauth_code_ttl" CHECK ("cms_auth"."oauth_codes"."expires_at" <= "cms_auth"."oauth_codes"."created_at" + interval '60 seconds')
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"kind" text NOT NULL,
	"family_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"family_expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "oauth_token_kind" CHECK ("cms_auth"."oauth_tokens"."kind" IN ('access','refresh')),
	CONSTRAINT "oauth_token_bounds" CHECK ("cms_auth"."oauth_tokens"."expires_at" <= "cms_auth"."oauth_tokens"."family_expires_at" AND "cms_auth"."oauth_tokens"."family_expires_at" <= "cms_auth"."oauth_tokens"."created_at" + interval '24 hours 1 minute')
);
--> statement-breakpoint
ALTER TABLE "cms_auth"."oauth_clients" ADD CONSTRAINT "oauth_clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "cms_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."oauth_codes" ADD CONSTRAINT "oauth_codes_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "cms_auth"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."oauth_codes" ADD CONSTRAINT "oauth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "cms_auth"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_audit_at" ON "cms_auth"."mcp_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "oauth_code_expiry" ON "cms_auth"."oauth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_token_family" ON "cms_auth"."oauth_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "oauth_token_user" ON "cms_auth"."oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_token_client" ON "cms_auth"."oauth_tokens" USING btree ("client_id");
--> statement-breakpoint
CREATE TRIGGER immutable_mcp_audit BEFORE UPDATE OR DELETE ON cms_auth.mcp_audit FOR EACH ROW EXECUTE FUNCTION cms_auth.guard_audit();
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA cms_auth FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE app_name text;
BEGIN
  IF current_user='tiny_osaka_test_owner' THEN app_name := 'tiny_osaka_test_app';
  ELSIF current_user='tiny_osaka_dev_owner' THEN app_name := 'tiny_osaka_dev_app';
  ELSIF current_user='tiny_osaka_staging_owner' THEN app_name := 'tiny_osaka_staging_app';
  ELSIF current_user='tiny_osaka_production_owner' THEN app_name := 'tiny_osaka_production_app';
  ELSE RAISE EXCEPTION 'Unexpected MCP migration owner'; END IF;
  -- Minimum grants for the authentication role only; the isolated CMS role gets nothing on these tables.
  EXECUTE format('GRANT SELECT ON cms_auth.oauth_clients,cms_auth.oauth_codes,cms_auth.oauth_tokens TO %I',app_name);
  EXECUTE format('GRANT INSERT (client_id,name,redirect_uris,created_by) ON cms_auth.oauth_clients TO %I',app_name);
  EXECUTE format('GRANT UPDATE (disabled_at) ON cms_auth.oauth_clients TO %I',app_name);
  EXECUTE format('GRANT INSERT,DELETE ON cms_auth.oauth_codes TO %I',app_name);
  EXECUTE format('GRANT UPDATE (used_at) ON cms_auth.oauth_codes TO %I',app_name);
  EXECUTE format('GRANT INSERT,DELETE ON cms_auth.oauth_tokens TO %I',app_name);
  EXECUTE format('GRANT UPDATE (last_used_at,revoked_at,replaced_by) ON cms_auth.oauth_tokens TO %I',app_name);
  EXECUTE format('GRANT INSERT (user_id,client_id,event,tool,target,outcome,code,request_id) ON cms_auth.mcp_audit TO %I',app_name);
END;
$$;

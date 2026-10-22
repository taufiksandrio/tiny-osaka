CREATE TABLE "cms_auth"."mcp_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"agent_token_hash" text NOT NULL,
	"user_token_hash" text NOT NULL,
	"target" text,
	"mime_declared" text,
	"byte_size_declared" bigint,
	"asset_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"agent_used_at" timestamp with time zone,
	"user_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_code" text,
	CONSTRAINT "mcp_uploads_agent_token_hash_unique" UNIQUE("agent_token_hash"),
	CONSTRAINT "mcp_uploads_user_token_hash_unique" UNIQUE("user_token_hash"),
	CONSTRAINT "mcp_upload_one_path" CHECK ("cms_auth"."mcp_uploads"."agent_used_at" IS NULL OR "cms_auth"."mcp_uploads"."user_used_at" IS NULL),
	CONSTRAINT "mcp_upload_status" CHECK ("cms_auth"."mcp_uploads"."status" IN ('pending','done','expired','rejected')),
	CONSTRAINT "mcp_upload_mime" CHECK ("cms_auth"."mcp_uploads"."mime_declared" IS NULL OR "cms_auth"."mcp_uploads"."mime_declared" IN ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "mcp_upload_size" CHECK ("cms_auth"."mcp_uploads"."byte_size_declared" IS NULL OR "cms_auth"."mcp_uploads"."byte_size_declared" BETWEEN 1 AND 10000000),
	CONSTRAINT "mcp_upload_target" CHECK (char_length(coalesce("cms_auth"."mcp_uploads"."target",'')) <= 200)
);
--> statement-breakpoint
ALTER TABLE "cms_auth"."mcp_audit" DROP CONSTRAINT "mcp_audit_event";--> statement-breakpoint
ALTER TABLE "cms_auth"."mcp_uploads" ADD CONSTRAINT "mcp_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."mcp_uploads" ADD CONSTRAINT "mcp_uploads_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "cms_auth"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_uploads_user" ON "cms_auth"."mcp_uploads" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "cms_auth"."mcp_audit" ADD CONSTRAINT "mcp_audit_event" CHECK ("cms_auth"."mcp_audit"."event" IN ('client_created','client_disabled','authorize_approved','authorize_denied','authorize_rejected','code_issued','code_replay','token_issued','token_refreshed','token_revoked','reuse_detected','tool_call','request_denied','rate_limited','family_revoked','upload_requested','upload_completed','upload_rejected'));
--> statement-breakpoint
REVOKE ALL ON cms_auth.mcp_uploads FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE app_name text;
BEGIN
  IF current_user='tiny_osaka_test_owner' THEN app_name := 'tiny_osaka_test_app';
  ELSIF current_user='tiny_osaka_dev_owner' THEN app_name := 'tiny_osaka_dev_app';
  ELSE RAISE EXCEPTION 'Unexpected MCP migration owner'; END IF;
  -- Authentication role only (the isolated CMS role gets nothing). No DELETE: rows are the upload record.
  -- UPDATE is limited to the outcome columns: claiming a path, releasing it after a transient failure, and the final result.
  EXECUTE format('GRANT SELECT,INSERT ON cms_auth.mcp_uploads TO %I',app_name);
  EXECUTE format('GRANT UPDATE (asset_id,status,agent_used_at,user_used_at,failure_code) ON cms_auth.mcp_uploads TO %I',app_name);
END;
$$;

CREATE SCHEMA "cms_auth";
--> statement-breakpoint
CREATE TABLE "cms_auth"."accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_identity" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."session_activity" (
	"session_id" text PRIMARY KEY NOT NULL,
	"last_active_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_event" CHECK ("cms_auth"."audit"."event" IN ('provision','login_success','login_failed','logout','session_expired','reset_requested','password_reset','password_changed','mfa_enabled','mfa_disabled','mfa_verified','email_verified','rate_limited'))
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."roles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "internal_role" CHECK ("cms_auth"."roles"."role" IN ('owner','staff'))
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token"),
	CONSTRAINT "absolute_session_limit" CHECK ("cms_auth"."sessions"."expires_at" <= "cms_auth"."sessions"."created_at" + interval '24 hours')
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone,
	CONSTRAINT "two_factors_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cms_auth"."verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_auth"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."session_activity" ADD CONSTRAINT "session_activity_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "cms_auth"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."roles" ADD CONSTRAINT "roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_auth"."two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user" ON "cms_auth"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user" ON "cms_auth"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier" ON "cms_auth"."verifications" USING btree ("identifier");
--> statement-breakpoint
CREATE FUNCTION cms_auth.initialize_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO cms_auth.session_activity(session_id,last_active_at) VALUES (NEW.id,NEW.created_at);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cms_auth.initialize_activity() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER initialize_session_activity AFTER INSERT ON cms_auth.sessions FOR EACH ROW EXECUTE FUNCTION cms_auth.initialize_activity();
--> statement-breakpoint
CREATE FUNCTION cms_auth.guard_session_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.token IS DISTINCT FROM OLD.token OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Session identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cms_auth.guard_session_identity() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER immutable_session_identity BEFORE UPDATE ON cms_auth.sessions FOR EACH ROW EXECUTE FUNCTION cms_auth.guard_session_identity();
--> statement-breakpoint
CREATE FUNCTION cms_auth.guard_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Authentication audit is append-only' USING ERRCODE='23514';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cms_auth.guard_audit() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER immutable_auth_audit BEFORE UPDATE OR DELETE ON cms_auth.audit FOR EACH ROW EXECUTE FUNCTION cms_auth.guard_audit();
--> statement-breakpoint
REVOKE ALL ON SCHEMA cms_auth FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA cms_auth FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE app_name text;
BEGIN
  IF current_user='tiny_osaka_test_owner' THEN app_name := 'tiny_osaka_test_app';
  ELSIF current_user='tiny_osaka_dev_owner' THEN app_name := 'tiny_osaka_dev_app';
  ELSE RAISE EXCEPTION 'Unexpected auth migration owner'; END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA cms_auth TO %I',app_name);
  EXECUTE format('GRANT SELECT ON cms_auth.users,cms_auth.accounts,cms_auth.roles TO %I',app_name);
  EXECUTE format('GRANT UPDATE (email_verified,two_factor_enabled,updated_at) ON cms_auth.users TO %I',app_name);
  EXECUTE format('GRANT UPDATE (password,updated_at) ON cms_auth.accounts TO %I',app_name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON cms_auth.sessions,cms_auth.verifications,cms_auth.two_factors,cms_auth.request_limits TO %I',app_name);
  EXECUTE format('GRANT SELECT,UPDATE ON cms_auth.session_activity TO %I',app_name);
  EXECUTE format('GRANT INSERT (user_id,event) ON cms_auth.audit TO %I',app_name);
END;
$$;

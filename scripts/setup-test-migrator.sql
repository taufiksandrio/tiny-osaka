\set ON_ERROR_STOP on
\set ECHO none
SET LOCAL password_encryption = 'scram-sha-256';
\if :{?complete_existing_role}
\else
\set complete_existing_role false
\endif

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba
    WHERE d.datname = 'tiny_osaka_test' AND r.rolname = 'tiny_osaka_test_owner'
    AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
    AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(d.datacl, acldefault('d',d.datdba))) a WHERE a.grantee = 0)) THEN
    RAISE EXCEPTION 'Test database/owner/PUBLIC isolation does not match approved setup.';
  END IF;
END $$;

\if :complete_existing_role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tiny_osaka_test_migrator'
    AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit) THEN
    RAISE EXCEPTION 'Expected unprivileged test migrator missing; refusing recovery.';
  END IF;
  IF (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname = 'tiny_osaka_test_migrator') <> 1 OR NOT EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
      JOIN pg_roles o ON o.oid = m.roleid WHERE r.rolname = 'tiny_osaka_test_migrator'
      AND o.rolname = 'tiny_osaka_test_owner' AND m.set_option
      AND NOT m.inherit_option AND NOT m.admin_option) THEN
    RAISE EXCEPTION 'Unexpected role membership; refusing recovery.';
  END IF;
END $$;
\else
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tiny_osaka_test_migrator') THEN
    RAISE EXCEPTION 'Test migrator exists; inspect state before recovery.';
  END IF;
END $$;
CREATE ROLE tiny_osaka_test_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 3;
GRANT CONNECT ON DATABASE tiny_osaka_test TO tiny_osaka_test_migrator;
GRANT tiny_osaka_test_owner TO tiny_osaka_test_migrator WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
\endif

DO $$ BEGIN
  IF NOT has_database_privilege('tiny_osaka_test_migrator','tiny_osaka_test','CONNECT')
    OR has_database_privilege('tiny_osaka_test_migrator','tiny_osaka_dev','CONNECT') THEN
    RAISE EXCEPTION 'Test migrator CONNECT isolation failed.';
  END IF;
END $$;
\echo Re-enter the NEW 20+ character migrator password you chose before administrator login.
\password tiny_osaka_test_migrator
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_authid WHERE rolname = 'tiny_osaka_test_migrator'
    AND rolpassword LIKE 'SCRAM-SHA-256$%') THEN
    RAISE EXCEPTION 'SCRAM password missing; rolling back.';
  END IF;
END $$;

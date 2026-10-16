\set ON_ERROR_STOP on
\set ECHO none
SET LOCAL password_encryption = 'scram-sha-256';

\if :{?complete_existing_roles}
\else
\set complete_existing_roles false
\endif

\if :complete_existing_roles
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN
    ('tiny_osaka_dev_app', 'tiny_osaka_test_app') AND rolcanlogin
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit) <> 2 THEN
    RAISE EXCEPTION 'Expected two unprivileged application LOGIN roles; no reset allowed.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname IN ('tiny_osaka_dev_app', 'tiny_osaka_test_app')) THEN
    RAISE EXCEPTION 'Unexpected application role membership; no reset allowed.';
  END IF;
  IF NOT has_database_privilege('tiny_osaka_dev_app', 'tiny_osaka_dev', 'CONNECT')
    OR NOT has_database_privilege('tiny_osaka_test_app', 'tiny_osaka_test', 'CONNECT')
    OR has_database_privilege('tiny_osaka_dev_app', 'tiny_osaka_test', 'CONNECT')
    OR has_database_privilege('tiny_osaka_test_app', 'tiny_osaka_dev', 'CONNECT') THEN
    RAISE EXCEPTION 'Unexpected database CONNECT privileges; no reset allowed.';
  END IF;
END $$;
\else
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
    ('tiny_osaka_dev_app', 'tiny_osaka_test_app')) THEN
    RAISE EXCEPTION 'Target LOGIN role already exists; no changes allowed.';
  END IF;
  IF (SELECT count(*) FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba
      WHERE (d.datname, r.rolname) IN
        (('tiny_osaka_dev', 'tiny_osaka_dev_owner'),
         ('tiny_osaka_test', 'tiny_osaka_test_owner'))
        AND NOT r.rolcanlogin AND NOT r.rolsuper
        AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(d.datacl,
          acldefault('d', d.datdba))) a WHERE a.grantee = 0)) <> 2 THEN
    RAISE EXCEPTION 'Expected databases, NOLOGIN owners or PUBLIC isolation missing.';
  END IF;
END $$;

CREATE ROLE tiny_osaka_dev_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 5;
CREATE ROLE tiny_osaka_test_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 5;
GRANT CONNECT ON DATABASE tiny_osaka_dev TO tiny_osaka_dev_app;
GRANT CONNECT ON DATABASE tiny_osaka_test TO tiny_osaka_test_app;
\endif

\echo Set a UNIQUE password of AT LEAST 20 characters for tiny_osaka_dev_app (remember it for the env prompt).
\password tiny_osaka_dev_app
\echo Set a DIFFERENT password of AT LEAST 20 characters for tiny_osaka_test_app (remember it for the env prompt).
\password tiny_osaka_test_app

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_authid WHERE rolname IN
    ('tiny_osaka_dev_app', 'tiny_osaka_test_app')
    AND rolpassword LIKE 'SCRAM-SHA-256$%') <> 2 THEN
    RAISE EXCEPTION 'Both LOGIN roles must have SCRAM passwords; rolling back.';
  END IF;
END $$;

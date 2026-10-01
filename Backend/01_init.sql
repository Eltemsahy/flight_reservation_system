-- =====================================================================
-- 01_init.sql  -  schemas, roles, JWT-claim helpers
--
-- Architecture: PostgREST (a prebuilt HTTP server, no application code)
-- exposes the "api" schema. Everything else lives in PostgreSQL:
--   api      tables, views and functions exposed over HTTP
--   private  user accounts + internal helpers (never exposed)
-- Needs PostgreSQL 15+ (security_invoker views).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA api;
CREATE SCHEMA private;

-- Functions are executable by PUBLIC by default. Make access opt-in instead.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------------
-- Roles. PostgREST logs in as "authenticator" and switches to one of the
-- others per request, depending on the "role" claim in the JWT.
--   web_anon   not logged in
--   app_user   any logged-in user          (inherits web_anon)
--   app_admin  users whose role is 'Admin' (inherits app_user)
-- ---------------------------------------------------------------------
CREATE ROLE web_anon  NOLOGIN;
CREATE ROLE app_user  NOLOGIN;
CREATE ROLE app_admin NOLOGIN;
GRANT web_anon TO app_user;
GRANT app_user TO app_admin;

-- Configure app.authenticator_password on the database or server before running
-- this file (Docker Compose sets it as a server option).
DO $$
BEGIN
    EXECUTE format(
        'CREATE ROLE authenticator LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER PASSWORD %L',
        current_setting('app.authenticator_password'));
END
$$;
GRANT web_anon, app_user, app_admin TO authenticator;

GRANT USAGE ON SCHEMA api, private TO web_anon, app_user, app_admin;

-- ---------------------------------------------------------------------
-- Helpers that read the verified JWT claims PostgREST puts in a setting
-- ---------------------------------------------------------------------
CREATE FUNCTION private.jwt_claim(claim text)
RETURNS text
LANGUAGE sql STABLE
AS $$
    SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb) ->> claim
$$;

CREATE FUNCTION private.current_user_id()
RETURNS integer
LANGUAGE sql STABLE
AS $$
    SELECT NULLIF(private.jwt_claim('user_id'), '')::integer
$$;

CREATE FUNCTION private.current_email()
RETURNS text
LANGUAGE sql STABLE
AS $$
    SELECT private.jwt_claim('email')
$$;

CREATE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
    SELECT COALESCE(private.jwt_claim('role') = 'app_admin', false)
$$;

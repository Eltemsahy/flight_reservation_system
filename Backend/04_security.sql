-- =====================================================================
-- 04_security.sql  -  who can do what
--
--   web_anon   read flights/airports/countries/airlines/seats/currencies; register; login
--   app_user   + own passengers, reservations, tickets, payments; book and cancel
--   app_admin  full access to everything in "api", incl. user management
-- =====================================================================

-- ---------------------------------------------------------------------
-- Anonymous (and, by inheritance, everyone)
-- ---------------------------------------------------------------------
GRANT SELECT ON api.countries, api.airports, api.airlines, api.currencies,
                api.flights, api.seats, api.flight_details
    TO web_anon;

GRANT EXECUTE ON FUNCTION
    api.login(text, text),
    api.register(text, text, text),
    private.jwt_claim(text),
    private.current_user_id(),
    private.current_email(),
    private.is_admin(),
    private.pre_request(),
    private.airline_json(integer),
    private.airport_json(text)
    TO web_anon;

-- ---------------------------------------------------------------------
-- Logged-in users
-- ---------------------------------------------------------------------
GRANT SELECT ON api.promotions, api.passengers, api.reservations, api.tickets,
                api.payments, api.reservation_details
    TO app_user;
GRANT INSERT, UPDATE, DELETE ON api.passengers TO app_user;
GRANT INSERT ON api.tickets, api.payments TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA api TO app_user;

GRANT EXECUTE ON FUNCTION
    api.me(),
    api.create_reservation(integer, integer, text),
    api.cancel_reservation(integer),
    api.my_flights(),
    private.can_access_passenger(integer),
    private.can_access_reservation(integer)
    TO app_user;

-- ---------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA api TO app_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA api TO app_admin;
-- api.users is a view over private.users: admins may only change role / is_active.
REVOKE INSERT, UPDATE ON api.users FROM app_admin;
GRANT UPDATE (role, is_active) ON api.users TO app_admin;
GRANT EXECUTE ON FUNCTION api.admin_create_user(text, text, text, text) TO app_admin;

-- ---------------------------------------------------------------------
-- Row-level security
-- Tables owned by the init role bypass RLS (triggers / SECURITY DEFINER code),
-- the web roles never do.
-- ---------------------------------------------------------------------
ALTER TABLE api.passengers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.tickets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.payments     ENABLE ROW LEVEL SECURITY;

-- passengers: users see/edit the ones they created or whose email is theirs
CREATE POLICY passengers_admin  ON api.passengers FOR ALL    TO app_admin USING (true) WITH CHECK (true);
CREATE POLICY passengers_select ON api.passengers FOR SELECT TO app_user
    USING (created_by = private.current_user_id() OR lower(email) = lower(private.current_email()));
CREATE POLICY passengers_insert ON api.passengers FOR INSERT TO app_user
    WITH CHECK (created_by = private.current_user_id());
CREATE POLICY passengers_update ON api.passengers FOR UPDATE TO app_user
    USING      (created_by = private.current_user_id() OR lower(email) = lower(private.current_email()))
    WITH CHECK (created_by = private.current_user_id() OR lower(email) = lower(private.current_email()));
CREATE POLICY passengers_delete ON api.passengers FOR DELETE TO app_user
    USING (created_by = private.current_user_id());

-- reservations: read-only for users; they book and cancel through the RPCs
CREATE POLICY reservations_admin  ON api.reservations FOR ALL    TO app_admin USING (true) WITH CHECK (true);
CREATE POLICY reservations_select ON api.reservations FOR SELECT TO app_user
    USING (private.can_access_passenger(passenger_id));

-- tickets and payments: users can read and add them for reservations they can access
CREATE POLICY tickets_admin  ON api.tickets FOR ALL    TO app_admin USING (true) WITH CHECK (true);
CREATE POLICY tickets_select ON api.tickets FOR SELECT TO app_user
    USING (private.can_access_reservation(reservation_id));
CREATE POLICY tickets_insert ON api.tickets FOR INSERT TO app_user
    WITH CHECK (private.can_access_reservation(reservation_id));

CREATE POLICY payments_admin  ON api.payments FOR ALL    TO app_admin USING (true) WITH CHECK (true);
CREATE POLICY payments_select ON api.payments FOR SELECT TO app_user
    USING (private.can_access_reservation(reservation_id));
CREATE POLICY payments_insert ON api.payments FOR INSERT TO app_user
    WITH CHECK (private.can_access_reservation(reservation_id));

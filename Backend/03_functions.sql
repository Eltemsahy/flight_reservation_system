-- =====================================================================
-- 03_functions.sql  -  JWT signing, business logic, triggers, views, RPC
--
-- Errors: RAISE ... USING ERRCODE = 'PT4xx' makes PostgREST answer with that
-- HTTP status (PT400 -> 400, PT401 -> 401, PT403 -> 403, PT404 -> 404).
-- =====================================================================

-- ---------------------------------------------------------------------
-- JWT (HS256) signing, replacing python-jose
-- ---------------------------------------------------------------------
CREATE FUNCTION private.url_encode(data bytea)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT translate(encode(data, 'base64'), E'+/=\n', '-_')
$$;

CREATE FUNCTION private.sign_jwt(payload jsonb, secret text)
RETURNS text
LANGUAGE sql STABLE
AS $$
    WITH parts AS (
        SELECT private.url_encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'utf8')) || '.' ||
               private.url_encode(convert_to(payload::text, 'utf8')) AS signing_input
    )
    SELECT signing_input || '.' || private.url_encode(extensions.hmac(signing_input, secret, 'sha256'))
    FROM parts
$$;

-- ---------------------------------------------------------------------
-- Users: create / login / register / me
-- ---------------------------------------------------------------------
CREATE FUNCTION private.create_user(p_username text, p_email text, p_password text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
    v_role text := COALESCE(p_role, 'User');
    v_id   integer;
BEGIN
    IF p_username IS NULL OR char_length(p_username) NOT BETWEEN 3 AND 50 THEN
        RAISE EXCEPTION 'Username must be between 3 and 50 characters' USING ERRCODE = 'PT400';
    END IF;
    IF p_email IS NULL OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RAISE EXCEPTION 'Invalid email address' USING ERRCODE = 'PT400';
    END IF;
    IF p_password IS NULL OR char_length(p_password) NOT BETWEEN 8 AND 100 THEN
        RAISE EXCEPTION 'Password must be between 8 and 100 characters' USING ERRCODE = 'PT400';
    END IF;
    IF p_password !~ '[A-Z]' THEN
        RAISE EXCEPTION 'Password must contain at least one uppercase letter' USING ERRCODE = 'PT400';
    END IF;
    IF p_password !~ '[a-z]' THEN
        RAISE EXCEPTION 'Password must contain at least one lowercase letter' USING ERRCODE = 'PT400';
    END IF;
    IF p_password !~ '[0-9]' THEN
        RAISE EXCEPTION 'Password must contain at least one digit' USING ERRCODE = 'PT400';
    END IF;
    IF v_role NOT IN ('User', 'Admin') THEN
        RAISE EXCEPTION 'Role must be User or Admin' USING ERRCODE = 'PT400';
    END IF;
    IF EXISTS (SELECT 1 FROM private.users u WHERE u.username = p_username) THEN
        RAISE EXCEPTION 'Username already registered' USING ERRCODE = 'PT400';
    END IF;
    IF EXISTS (SELECT 1 FROM private.users u WHERE lower(u.email) = lower(p_email)) THEN
        RAISE EXCEPTION 'Email already registered' USING ERRCODE = 'PT400';
    END IF;

    INSERT INTO private.users (username, email, password_hash, role)
    VALUES (p_username, p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), v_role)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id, 'username', p_username, 'email', p_email,
                              'is_active', true, 'role', v_role);
END
$$;

-- POST /rpc/register   {"username": "...", "email": "...", "password": "..."}
CREATE FUNCTION api.register(username text, email text, password text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $$
    SELECT private.create_user(register.username, register.email, register.password, 'User')
$$;

-- POST /rpc/admin_create_user   (admin only)
CREATE FUNCTION api.admin_create_user(username text, email text, password text, role text DEFAULT 'User')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'Admin access required' USING ERRCODE = 'PT403';
    END IF;
    RETURN private.create_user(admin_create_user.username, admin_create_user.email,
                               admin_create_user.password, admin_create_user.role);
END
$$;

-- POST /rpc/login   {"username": "...", "password": "..."}   (username or email)
-- The signing secret comes from the server setting "app.jwt_secret" (docker-compose).
CREATE FUNCTION api.login(username text, password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
    v_secret text := current_setting('app.jwt_secret', true);
    u        private.users;
    v_role   text;
BEGIN
    IF v_secret IS NULL OR char_length(v_secret) < 32 THEN
        RAISE EXCEPTION 'JWT secret is not configured on the database server' USING ERRCODE = 'PT500';
    END IF;

    SELECT x.* INTO u
    FROM private.users x
    WHERE x.username = login.username OR lower(x.email) = lower(login.username)
    ORDER BY (x.username = login.username) DESC
    LIMIT 1;

    IF NOT FOUND OR NOT u.is_active
       OR u.password_hash <> extensions.crypt(login.password, u.password_hash) THEN
        RAISE EXCEPTION 'Incorrect username or password' USING ERRCODE = 'PT401';
    END IF;

    v_role := CASE WHEN lower(u.role) = 'admin' THEN 'app_admin' ELSE 'app_user' END;

    RETURN jsonb_build_object(
        'access_token', private.sign_jwt(
            jsonb_build_object(
                'role',    v_role,
                'sub',     u.username,
                'user_id', u.id,
                'email',   u.email,
                'exp',     extract(epoch FROM now() + INTERVAL '30 minutes')::bigint),
            v_secret),
        'token_type', 'bearer',
        'username',   u.username,
        'role',       u.role);
END
$$;

-- GET /rpc/me   (also serves as token verification: bad/expired token -> 401)
CREATE FUNCTION api.me()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
    v jsonb;
BEGIN
    SELECT jsonb_build_object('id', u.id, 'username', u.username, 'email', u.email,
                              'is_active', u.is_active, 'role', u.role)
    INTO v
    FROM private.users u
    WHERE u.id = private.current_user_id();

    IF v IS NULL THEN
        RAISE EXCEPTION 'User not found' USING ERRCODE = 'PT401';
    END IF;
    RETURN v;
END
$$;

-- Runs before EVERY request (PGRST_DB_PRE_REQUEST). A token stays cryptographically
-- valid for 30 minutes, so this rejects tokens of deleted/deactivated users and
-- tokens whose role no longer matches the user's current role.
CREATE FUNCTION private.pre_request()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
    v_uid    integer := private.current_user_id();
    v_active boolean;
    v_role   text;
BEGIN
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    SELECT u.is_active, CASE WHEN lower(u.role) = 'admin' THEN 'app_admin' ELSE 'app_user' END
    INTO v_active, v_role
    FROM private.users u
    WHERE u.id = v_uid;

    IF NOT FOUND OR NOT v_active OR v_role IS DISTINCT FROM private.jwt_claim('role') THEN
        RAISE EXCEPTION 'Invalid authentication credentials' USING ERRCODE = 'PT401';
    END IF;
END
$$;

-- ---------------------------------------------------------------------
-- Ownership checks used by row-level security and RPCs.
-- A user can access a passenger they created or whose email is their own;
-- admins can access everything.
-- ---------------------------------------------------------------------
CREATE FUNCTION private.can_access_passenger(p_passenger_id integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
    SELECT private.is_admin() OR EXISTS (
        SELECT 1
        FROM api.passengers p
        WHERE p.id = p_passenger_id
          AND (p.created_by = private.current_user_id()
               OR lower(p.email) = lower(private.current_email()))
    )
$$;

CREATE FUNCTION private.can_access_reservation(p_reservation_id integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
    SELECT private.is_admin() OR EXISTS (
        SELECT 1
        FROM api.reservations r
        WHERE r.id = p_reservation_id
          AND private.can_access_passenger(r.passenger_id)
    )
$$;

-- ---------------------------------------------------------------------
-- Seats: generated automatically for every new flight
-- (70% economy / 20% business / 10% first, window/aisle/middle rotation).
-- ---------------------------------------------------------------------
CREATE FUNCTION private.generate_flight_seats(p_flight_id integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
    v_total    integer;
    v_economy  integer;
    v_business integer;
    v_inserted integer;
BEGIN
    SELECT f.total_seats INTO v_total FROM api.flights f WHERE f.id = p_flight_id;
    IF v_total IS NULL THEN
        RETURN 0;
    END IF;

    v_economy  := floor(v_total * 0.7);
    v_business := floor(v_total * 0.2);

    INSERT INTO api.seats (seat_number, class_type, is_available, seat_type, flight_id)
    SELECT n::text,
           CASE WHEN n <= v_economy              THEN 'economy'
                WHEN n <= v_economy + v_business THEN 'business'
                ELSE 'first' END,
           TRUE,
           (ARRAY['window', 'aisle', 'middle'])[(n % 3) + 1],
           p_flight_id
    FROM generate_series(1, v_total) AS n
    ON CONFLICT (flight_id, seat_number) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted;
END
$$;

CREATE FUNCTION private.flights_generate_seats()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
    PERFORM private.generate_flight_seats(NEW.id);
    RETURN NEW;
END
$$;

CREATE FUNCTION private.flights_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.departure_code  := upper(NEW.departure_code);
    NEW.destination_code := upper(NEW.destination_code);
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_flights_normalize
    BEFORE INSERT OR UPDATE ON api.flights
    FOR EACH ROW EXECUTE FUNCTION private.flights_normalize();

CREATE TRIGGER trg_flights_seats
    AFTER INSERT ON api.flights
    FOR EACH ROW EXECUTE FUNCTION private.flights_generate_seats();

-- Free the seat when a reservation is canceled (or deleted while still active).
CREATE FUNCTION private.reservations_release_seat()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'Canceled' THEN
            UPDATE api.seats SET is_available = TRUE, reservation_time = NULL
            WHERE flight_id = OLD.flight_id AND seat_number = OLD.seat_number;
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.status = 'Canceled' AND OLD.status <> 'Canceled' THEN
        UPDATE api.seats SET is_available = TRUE, reservation_time = NULL
        WHERE flight_id = NEW.flight_id AND seat_number = NEW.seat_number;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_reservations_release_seat_upd
    AFTER UPDATE OF status ON api.reservations
    FOR EACH ROW EXECUTE FUNCTION private.reservations_release_seat();

CREATE TRIGGER trg_reservations_release_seat_del
    AFTER DELETE ON api.reservations
    FOR EACH ROW EXECUTE FUNCTION private.reservations_release_seat();

-- ---------------------------------------------------------------------
-- JSON helpers + views (security_invoker: row-level security of the caller applies)
-- ---------------------------------------------------------------------
CREATE FUNCTION private.airline_json(p_id integer)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
    SELECT jsonb_build_object('id', al.id, 'name', al.name, 'iata_code', al.iata_code,
                              'icao_code', al.icao_code, 'headquarters', al.headquarters,
                              'year_founded', al.year_founded, 'base_airport_code', al.base_airport_code)
    FROM api.airlines al
    WHERE al.id = p_id
$$;

CREATE FUNCTION private.airport_json(p_code text)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
    SELECT jsonb_build_object(
        'code', a.code, 'name', a.name, 'location', a.location,
        'country_code', a.country_code, 'number_of_terminals', a.number_of_terminals,
        'country', CASE WHEN c.code IS NULL THEN NULL ELSE jsonb_build_object(
            'code', c.code, 'name', c.name, 'continent', c.continent,
            'official_language', c.official_language,
            'is_schengen_zone_member', c.is_schengen_zone_member) END)
    FROM api.airports a
    LEFT JOIN api.countries c ON c.code = a.country_code
    WHERE a.code = p_code
$$;

-- GET /flight_details?departure_code=eq.JFK&destination_code=eq.LHR&departure_date=eq.2026-10-02
CREATE VIEW api.flight_details WITH (security_invoker = true) AS
SELECT
    f.id,
    f.flight_number,
    f.departure_code,
    f.destination_code,
    f.departure_time,
    f.arrival_time,
    f.departure_time::date AS departure_date,
    f.total_seats,
    (SELECT count(*) FROM api.seats s WHERE s.flight_id = f.id AND s.is_available)::integer AS available_seats,
    f.gate,
    f.terminal,
    f.airline_id,
    f.days_of_operation,
    f.user_id,
    private.airline_json(f.airline_id)       AS airline,
    private.airport_json(f.departure_code)   AS departure_airport,
    private.airport_json(f.destination_code) AS destination_airport
FROM api.flights f;

-- GET /reservation_details?id=eq.5   (rows limited by row-level security)
CREATE VIEW api.reservation_details WITH (security_invoker = true) AS
SELECT
    r.id,
    r.passenger_id,
    r.flight_id,
    r.seat_number,
    r.status,
    r.final_price,
    r.created_at,
    (SELECT to_jsonb(fd) FROM api.flight_details fd WHERE fd.id = r.flight_id) AS flight,
    (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'national_id', p.national_id,
                               'email', p.email, 'phone_number', p.phone_number,
                               'nationality', p.nationality, 'passport_number', p.passport_number,
                               'is_vip', p.is_vip)
     FROM api.passengers p WHERE p.id = r.passenger_id) AS passenger,
    (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.ticket_number), '[]'::jsonb)
     FROM api.tickets t WHERE t.reservation_id = r.id) AS tickets
FROM api.reservations r;

-- Admin-only user management: GET/PATCH/DELETE /users  (no password hashes exposed)
CREATE VIEW api.users AS
SELECT u.id, u.username, u.email, u.is_active, u.role
FROM private.users u;

-- ---------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------
-- POST /rpc/create_reservation   {"passenger_id": 1, "flight_id": 1, "seat_number": "12"}
CREATE FUNCTION api.create_reservation(passenger_id integer, flight_id integer, seat_number text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
    v_seat_id integer;
    v_res_id  integer;
BEGIN
    IF private.current_user_id() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'PT401';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM api.flights f WHERE f.id = create_reservation.flight_id) THEN
        RAISE EXCEPTION 'Flight not found' USING ERRCODE = 'PT404';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM api.passengers p WHERE p.id = create_reservation.passenger_id) THEN
        RAISE EXCEPTION 'Passenger not found' USING ERRCODE = 'PT404';
    END IF;
    IF NOT private.can_access_passenger(create_reservation.passenger_id) THEN
        RAISE EXCEPTION 'You do not have access to this passenger' USING ERRCODE = 'PT403';
    END IF;

    -- Row lock: two concurrent requests cannot take the same seat.
    SELECT s.seat_id INTO v_seat_id
    FROM api.seats s
    WHERE s.flight_id = create_reservation.flight_id
      AND s.seat_number = create_reservation.seat_number
      AND s.is_available
    FOR UPDATE;

    IF v_seat_id IS NULL THEN
        RAISE EXCEPTION 'Seat not available' USING ERRCODE = 'PT400';
    END IF;

    INSERT INTO api.reservations (passenger_id, flight_id, seat_number, status,
                                  departure_country, destination_country)
    SELECT create_reservation.passenger_id, f.id, create_reservation.seat_number, 'Pending',
           COALESCE(dep.country_code, f.departure_code),
           COALESCE(dst.country_code, f.destination_code)
    FROM api.flights f
    LEFT JOIN api.airports dep ON dep.code = f.departure_code
    LEFT JOIN api.airports dst ON dst.code = f.destination_code
    WHERE f.id = create_reservation.flight_id
    RETURNING id INTO v_res_id;

    UPDATE api.seats SET is_available = FALSE, reservation_time = now()
    WHERE seat_id = v_seat_id;

    RETURN (SELECT to_jsonb(rd) FROM api.reservation_details rd WHERE rd.id = v_res_id);
END
$$;

-- POST /rpc/cancel_reservation   {"reservation_id": 5}   (the seat is freed by a trigger)
CREATE FUNCTION api.cancel_reservation(reservation_id integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
    IF private.current_user_id() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'PT401';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM api.reservations r WHERE r.id = cancel_reservation.reservation_id) THEN
        RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'PT404';
    END IF;
    IF NOT private.can_access_reservation(cancel_reservation.reservation_id) THEN
        RAISE EXCEPTION 'You do not have access to this reservation' USING ERRCODE = 'PT403';
    END IF;

    UPDATE api.reservations SET status = 'Canceled'
    WHERE id = cancel_reservation.reservation_id;

    RETURN jsonb_build_object('detail', 'Reservation canceled');
END
$$;

-- GET /rpc/my_flights   (flights of passengers the caller created or whose email matches theirs)
CREATE FUNCTION api.my_flights()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',               f.id,
        'flight_number',    f.flight_number,
        'departure_code',   f.departure_code,
        'destination_code', f.destination_code,
        'departure_time',   f.departure_time,
        'arrival_time',     f.arrival_time,
        'gate',             f.gate,
        'terminal',         f.terminal,
        'airline',             jsonb_build_object('id', al.id, 'name', al.name),
        'departure_airport',   jsonb_build_object('code', dep.code, 'name', dep.name),
        'destination_airport', jsonb_build_object('code', dst.code, 'name', dst.name),
        'reservation_id',   r.id,
        'seat_number',      r.seat_number,
        'status',           r.status,
        'seats', (SELECT COALESCE(jsonb_agg(jsonb_build_object('seat_number', s.seat_number,
                                                               'is_available', s.is_available)
                                            ORDER BY s.seat_id), '[]'::jsonb)
                  FROM api.seats s WHERE s.flight_id = f.id)
    ) ORDER BY f.departure_time), '[]'::jsonb)
    FROM api.reservations r
    JOIN api.passengers p ON p.id = r.passenger_id
    JOIN api.flights f    ON f.id = r.flight_id
    LEFT JOIN api.airlines al ON al.id = f.airline_id
    LEFT JOIN api.airports dep ON dep.code = f.departure_code
    LEFT JOIN api.airports dst ON dst.code = f.destination_code
    WHERE p.created_by = private.current_user_id()
       OR lower(p.email) = lower(private.current_email())
$$;

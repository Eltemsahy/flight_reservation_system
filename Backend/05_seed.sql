-- =====================================================================
-- 05_seed.sql  -  sample data (re-runnable)
-- =====================================================================

INSERT INTO api.countries (code, name, continent, official_language, is_schengen_zone_member) VALUES
    ('US', 'United States',  'North America', 'English', FALSE),
    ('GB', 'United Kingdom', 'Europe',        'English', FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO api.airports (code, name, location, country_code, number_of_terminals) VALUES
    ('JFK', 'John F. Kennedy International Airport', 'New York', 'US', 6),
    ('LHR', 'Heathrow Airport',                      'London',   'GB', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO api.airlines (name, iata_code, icao_code, headquarters, year_founded, base_airport_code) VALUES
    ('SampleAir', 'SA', 'SMP', 'New York', 2000, 'JFK')
ON CONFLICT (iata_code) DO NOTHING;

-- Placeholder rates (relative to USD) so payments have valid currencies - replace with real ones.
INSERT INTO api.currencies (currency_code, symbol, exchange_rate, country_name, last_updated) VALUES
    ('USD', '$',  1.00,  'United States',  CURRENT_TIMESTAMP),
    ('EUR', '€',  0.90,  'Eurozone',       CURRENT_TIMESTAMP),
    ('GBP', '£',  0.78,  'United Kingdom', CURRENT_TIMESTAMP),
    ('EGP', 'E£', 48.00, 'Egypt',          CURRENT_TIMESTAMP)
ON CONFLICT (currency_code) DO NOTHING;

-- Default admin: username "admin", password "Admin123"  ->  CHANGE THIS after first login.
INSERT INTO private.users (username, email, password_hash, role)
VALUES ('admin', 'admin@example.com', extensions.crypt('Admin123', extensions.gen_salt('bf')), 'Admin')
ON CONFLICT (username) DO NOTHING;

-- Seats are created by the trigger on api.flights.
INSERT INTO api.flights (flight_number, departure_code, destination_code, departure_time, arrival_time,
                         total_seats, gate, terminal, airline_id, days_of_operation)
SELECT 'SA100', 'JFK', 'LHR',
       date_trunc('hour', CURRENT_TIMESTAMP) + INTERVAL '1 day',
       date_trunc('hour', CURRENT_TIMESTAMP) + INTERVAL '1 day 7 hours',
       180, 'A12', '4', a.id, 127
FROM api.airlines a WHERE a.iata_code = 'SA'
ON CONFLICT (flight_number) DO NOTHING;

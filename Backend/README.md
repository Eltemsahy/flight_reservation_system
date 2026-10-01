# Flight Reservation System - SQL backend

**PostgreSQL** holds the schema, business rules, authentication and permissions.
**PostgREST** exposes the `api` schema directly as a REST API; there is no Python backend.

## Local Windows Setup (No Docker)

Install PostgreSQL 16 or later using the [Windows installer](https://www.postgresql.org/download/windows/). Download and extract the [PostgREST v12.2.3 Windows x64 release](https://github.com/PostgREST/postgrest/releases/tag/v12.2.3). Add the PostgreSQL `bin` folder and the extracted PostgREST folder to `PATH`, or use their full executable paths below. Make sure the PostgreSQL service is running.

Open PowerShell in this directory. Create two random secrets and keep them in the ignored local file `.env.local`:

```powershell
function New-HexSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

$jwtSecret = New-HexSecret
$authenticatorPassword = New-HexSecret
@"
JWT_SECRET=$jwtSecret
AUTHENTICATOR_PASSWORD=$authenticatorPassword
"@ | Set-Content .env.local
$secrets = Get-Content .env.local | ConvertFrom-StringData
```

Create the database and set its secrets. `psql` prompts for the PostgreSQL administrator password:

```powershell
psql -h localhost -U postgres -d postgres -c "CREATE DATABASE flights;"
psql -h localhost -U postgres -d postgres -c "ALTER DATABASE flights SET app.jwt_secret = '$($secrets.JWT_SECRET)';"
psql -h localhost -U postgres -d postgres -c "ALTER DATABASE flights SET app.authenticator_password = '$($secrets.AUTHENTICATOR_PASSWORD)';"
```

Apply the SQL files once, in order, from the `Backend` directory:

```powershell
$sqlFiles = '01_init.sql', '02_tables.sql', '03_functions.sql', '04_security.sql', '05_seed.sql'
foreach ($file in $sqlFiles) {
    psql -h localhost -U postgres -d flights -v ON_ERROR_STOP=1 -f $file
    if ($LASTEXITCODE -ne 0) { throw "Failed to apply $file" }
}
```

Start PostgREST in that same PowerShell window. Keep the window open while using the app:

```powershell
$env:PGRST_DB_URI = "postgres://authenticator:$($secrets.AUTHENTICATOR_PASSWORD)@localhost:5432/flights"
$env:PGRST_JWT_SECRET = $secrets.JWT_SECRET
postgrest .\postgrest.conf.example
```

The API is at `http://localhost:3000`; the React app uses that address by default. To verify it, open `http://localhost:3000/flight_details` in a browser.

The database scripts are initialization scripts, not migrations. To reset a local database, first back up anything you need, then drop and recreate the `flights` database and run the scripts again.

## Optional Docker Setup

Copy `.env.example` to `.env`, set the three distinct random hex values, then run `docker compose up -d`. Docker initializes the database from the numbered SQL files on the first start. To discard that Docker database and recreate it, run `docker compose down -v`.

## Old endpoint -> new endpoint

Send the token as `Authorization: Bearer <access_token>`. For POST/PATCH add
`Prefer: return=representation` to get the saved row back.

| Old (FastAPI)                                             | New (PostgREST)                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST /token` (form)                                      | `POST /rpc/login` `{username, password}` (JSON or form) - username or email                                     |
| `POST /register/`                                         | `POST /rpc/register` `{username, email, password}`                                                              |
| `GET /verify-token`, `/users/me/`, `/user/profile/`       | `GET /rpc/me` (401 if the token is invalid or the user was deactivated)                                         |
| `GET /users/` (admin)                                     | `GET /users?or=(username.ilike.*x*,email.ilike.*x*)&limit=100&offset=0`                                         |
| `POST /users/` (admin)                                    | `POST /rpc/admin_create_user` `{username, email, password, role}`                                               |
| `PUT /users/{id}` (admin)                                 | `PATCH /users?id=eq.{id}` `{role, is_active}`                                                                   |
| `DELETE /users/{id}` (admin)                              | `DELETE /users?id=eq.{id}`                                                                                      |
| `GET /flights`, `/flights/search`                         | `GET /flight_details?departure_code=eq.JFK&destination_code=eq.LHR&departure_date=eq.2026-10-02`                |
| `POST /flights` (admin)                                   | `POST /flights` (seats are generated by a trigger; don't send `available_seats`)                                |
| `PUT /flights/{id}/`, `DELETE ...`                        | `PATCH /flights?id=eq.{id}`, `DELETE /flights?id=eq.{id}` (admin)                                               |
| `GET /flights/user-flights`                               | `GET /rpc/my_flights`                                                                                           |
| `POST /reservations/`                                     | `POST /rpc/create_reservation` `{passenger_id, flight_id, seat_number}`                                         |
| `DELETE /reservations/{id}/`                              | `POST /rpc/cancel_reservation` `{reservation_id}`                                                               |
| (reservation lookups)                                     | `GET /reservation_details?id=eq.{id}`                                                                           |
| `/passengers/` GET, POST, PUT, DELETE                     | `GET/POST /passengers`, `PATCH/DELETE /passengers?id=eq.{id}`                                                   |
| `POST /tickets/`, `POST /payments/`                       | `POST /tickets`, `POST /payments`                                                                               |
| `/airports/`, `/countries/`, `/airlines/`, `/promotions/` | `GET/POST /airports`, `PATCH/DELETE /airports?code=eq.JFK` (same pattern for the others; writes are admin-only) |
| `skip` / `limit`                                          | `offset` / `limit`                                                                                              |
| `GET /`, `/health`                                        | `GET /` (OpenAPI description of the whole API)                                                                  |

Airport codes in filters must be upper case (`eq.JFK`), or use `ilike.jfk`.

## Permissions

| Role      | Can do                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| anonymous | read flights, airports, countries, airlines, seats, currencies; register; log in                                                                                             |
| user      | + read promotions; create/read/edit the passengers they created (or whose email is theirs); book and cancel for those passengers; add tickets/payments to their reservations |
| admin     | everything in `api`, plus user management                                                                                                                                    |

# Flight Reservation System

A flight reservation application with a React frontend and a PostgreSQL database exposed through PostgREST. Database schema, authentication, permissions and reservation rules are defined in SQL.

## Features

- **User Authentication**: Secure login and registration with JWT tokens
- **Flight Search**: Search flights by departure/destination airports and date
- **Seat Selection**: Interactive seat map for flight reservations
- **Reservation Management**: View and manage booked flights
- **Admin Panel**: Administrative functions for managing flights, passengers, and data
- **Database API**: PostgREST exposes PostgreSQL tables, views and RPC functions directly to the frontend
- **Database Security**: JWT authentication and row-level security are enforced in PostgreSQL
- **Responsive Design**: Modern React UI with CSS styling

## Tech Stack

### Frontend

- React 18
- Vite (build tool)
- React Router (routing)
- Axios (API calls)
- CSS Modules

### Backend

- PostgreSQL 16+
- PostgREST 12.2.3
- SQL schema, business logic and access policies

## Prerequisites

- PostgreSQL 16+
- PostgREST 12.2.3 (Windows x64 release)
- Node.js 16+
- npm or yarn

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd flight-reservation-app
   ```

2. **Database and API Setup (Windows, no Docker)**

   Follow the native PostgreSQL/PostgREST setup in [Backend/README.md](Backend/README.md). It creates the local database, applies the SQL files, and starts PostgREST. Docker Compose remains available there as an optional setup.

   The seeded admin account is `admin` / `Admin123`; change it after the first login.

3. **Frontend Setup**

   Open a separate PowerShell terminal at the project root, then run:

   ```bash
   npm install
   ```

   The frontend uses `http://localhost:3000` by default. Set `VITE_POSTGREST_URL` in a local Vite environment file if PostgREST is hosted elsewhere.

## Running the Application

1. **Start PostgreSQL and PostgREST**

   Start the PostgreSQL Windows service, then start PostgREST using the command in [Backend/README.md](Backend/README.md). Keep the PostgREST terminal open.

2. **Start the Frontend**

   In a separate terminal at the project root, run:

   ```bash
   npm run dev
   ```

3. **Access the Application**
   - Frontend: http://localhost:5173
   - PostgREST API: http://localhost:3000
   - PostgreSQL: localhost:5432

## API Endpoints

The PostgREST routes and RPC request bodies are documented in [Backend/README.md](Backend/README.md). The API root (`http://localhost:3000/`) returns its OpenAPI description.

## Database Schema

The application uses the following main entities:

- Users
- Flights
- Passengers
- Reservations
- Seats
- Airports
- Airlines
- Countries
- Payments
- Tickets
- Promotions

## Project Structure

```
flight-reservation-app/
├── Backend/
│   ├── docker-compose.yml   # Optional PostgreSQL + PostgREST containers
│   ├── postgrest.conf.example # Native PostgREST settings
│   ├── 01_init.sql          # Roles and schemas
│   ├── 02_tables.sql        # Tables and constraints
│   ├── 03_functions.sql     # Business logic and RPCs
│   ├── 04_security.sql      # Grants and row-level security
│   └── 05_seed.sql          # Initial reference data
├── src/
│   ├── components/          # React components
│   ├── pages/               # Application pages
│   ├── services/            # API services
│   └── assets/              # Static assets
├── public/                  # Public assets
└── package.json             # Frontend dependencies
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

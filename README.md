# Boostan Factory ERP

Integrated ERP for a small factory with one manager and production/sales operators.

## Main modules

- Authentication and role-based access (`MANAGER`, `OPERATOR`)
- Products
- Production registration
- Sales invoices with multiple items
- Customers and receivables
- Inventory and low-stock alerts
- Customer payments
- Management dashboard
- Reports with Excel/PDF export
- Users management
- Activity log

## Project layout

- `backend/` Node.js + Express API
- `frontend/` React + Vite web app
- `database/` Supabase/PostgreSQL schema and upgrade scripts
- `deployment/` Docker and local/production notes
- `tests/` end-to-end smoke-test instructions

## Quick local start

### 1. Database

Use an existing Supabase PostgreSQL project. For a fresh database run `database/schema.sql` in the Supabase SQL Editor. If you previously used the early prototype schema, run `database/upgrade_from_prototype.sql` instead.

### 2. Backend

```bash
cd backend
copy .env.example .env
npm install
npm run seed:manager
npm start
```

Fill `.env` before running the seed or server.

### 3. Frontend

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

## Default security model

- The first manager is created with `npm run seed:manager` using environment variables.
- There is no public registration endpoint.
- Managers can manage users, reports, payments, inventory adjustments, and master data.
- Operators can register production and sales and can see only their own production/sales history.

## Release status

This package is an integrated release candidate. It is build-tested locally, but the final acceptance test must be run against the actual Supabase project and factory workflow before real production use.

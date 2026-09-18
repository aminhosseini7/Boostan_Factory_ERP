# Architecture

React/Vite frontend -> Express REST API -> Supabase PostgreSQL.

Backend flow: route -> controller -> service -> PostgreSQL. Business transactions for production and sales are atomic. Sales use PostgreSQL advisory transaction locks per product before checking inventory to reduce overselling under concurrent requests.

Inventory is ledger-based; stock is derived from `inventory_transactions`. Receivables are derived from sales minus payments.

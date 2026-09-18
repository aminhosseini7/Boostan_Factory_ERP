# API summary

All protected calls use `Authorization: Bearer <token>`.

## Authentication
- `POST /api/auth/login`
- `GET /api/auth/me`

## Users (manager)
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id/active`

## Products
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products` (manager)
- `PUT /api/products/:id` (manager)
- `DELETE /api/products/:id` (manager, soft deactivation)

## Customers
- `GET /api/customers`
- `GET /api/customers/:id`
- `POST /api/customers`
- `PUT /api/customers/:id` (manager)
- `GET /api/customers/:id/statement` (manager)

## Production
- `GET /api/production` (operator sees own records)
- `POST /api/production`

## Sales
- `GET /api/sales` (operator sees own records)
- `GET /api/sales/:id`
- `POST /api/sales`

## Payments (manager)
- `GET /api/payments`
- `POST /api/payments`

## Inventory
- `GET /api/inventory`
- `GET /api/inventory/low-stock`
- `GET /api/inventory/movement/:productId`
- `POST /api/inventory/adjustments` (manager)

## Dashboard (manager)
- `GET /api/dashboard`

## Reports (manager)
- `GET /api/reports/:type`
- `GET /api/reports/:type/export/xlsx`
- `GET /api/reports/:type/export/pdf`

Types: `production`, `production-monthly`, `sales`, `sales-monthly`, `inventory`, `debtors`, `operators`.

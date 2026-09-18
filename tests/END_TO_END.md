# End-to-end acceptance test

Run after database migration and manager seeding.

1. Log in as manager.
2. Create three operator users.
3. Create a product with opening stock 10 and minimum stock 5.
4. Register production quantity 100. Inventory should become 110.
5. Create a customer.
6. Create a credit sale for quantity 20. Inventory should become 90 and customer balance should equal sale total.
7. Create a manual payment. Customer balance should decrease by exactly that amount.
8. Create a cash/card sale. An automatic payment should be recorded and it should not increase receivables.
9. Verify manager dashboard production, sales, inventory, low-stock count, debt, charts and activities.
10. Log in as operator. The operator must not access users/reports/dashboard and must see only their own production/sales history.
11. Export Excel and PDF reports.

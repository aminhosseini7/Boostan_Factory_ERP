# Phase 9 - Factory End-to-End Testing

## Scenario 1: Production Shift

Input:
- Operator starts shift
- Counter start recorded
- Counter end recorded
- Defects recorded

Expected:
total production = counter end - counter start
good production = total production - defects


## Scenario 2: Sale

Input:
- Customer selected
- One or more basket products selected
- Discount applied

Expected:
subtotal calculated
discount applied
final amount generated


## Scenario 3: Inventory

Expected flow:

Opening Balance
+
Production In
-
Sales Out
=
Current Inventory


## Scenario 4: Customer Credit

Input:
- Credit sale
- Payment later

Expected:
customer balance updated correctly


## Scenario 5: Permission Test

Operator:
- Can create production
- Can create sales

Operator:
- Cannot change prices
- Cannot change system settings

Manager:
- Full management access

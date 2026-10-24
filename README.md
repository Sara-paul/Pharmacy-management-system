# PharmaCare – Pharmacy Management System
React (Vite) + Node/Express + MySQL (MySQL Workbench)

## Logins
| Role | Username | Password | Can do |
|---|---|---|---|
| Admin | admin | admin123 | Everything: dashboard, users, medicines, sales |
| Pharmacist | pharmacist | pharma123 | Add/edit medicines & stock |
| Cashier | cashier | cash123 | Make sales, view sales, view medicines |
| Normal user (customer) | self-register on login page | your choice | Browse medicines, view own orders |

## Run (3 steps)
1. **Database** – open MySQL Workbench, connect, open `database/schema.sql`, click Execute (⚡).
2. **Config** – edit `backend/.env` and put your MySQL root password in `DB_PASSWORD`.
3. **Install & start** (Node.js 18+ required), from this folder:
   ```
   npm run setup
   npm start
   ```
Open http://localhost:3000 (API runs on port 5000).

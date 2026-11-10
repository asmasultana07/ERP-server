# VENDORA ERP — Backend API


## Tech Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js 5
- **Database:** MongoDB Atlas via Mongoose 9
- **Authentication:** JWT (JSON Web Tokens) with 7-day expiration & `bcryptjs` (12 salt rounds)
- **CORS:** Pre-configured for local development and production Vercel frontend

---

## Environment Variables

Create a `.env` file in the `server` root directory:

```env
PORT=
MONGODB_URI= 
JWT_SECRET= 
CLIENT_URL= 
```

---

## Quick Start

```bash
# 1. Navigate to server directory
cd server

# 2. Install dependencies
npm install

# 3. Run in development mode (with nodemon)
npm run dev

# 4. Run in production mode
npm start
```

The server starts on `http://localhost:5000`. Test health status at `http://localhost:5000/api/health`.

---

## API Endpoints Reference

All endpoints except `/api/auth/register`, `/api/auth/login`, and `/api/health` require `Authorization: Bearer <token>`.

| Route | Methods | Description |
|---|---|---|
| `/api/health` | `GET` | Health status and MongoDB connection state |
| `/api/auth/register` | `POST` | Register a new user |
| `/api/auth/login` | `POST` | Authenticate user & return JWT token |
| `/api/auth/me` | `GET` | Retrieve authenticated user profile |
| `/api/products` | `GET, POST` | List products (with search/category) / Create product |
| `/api/products/:id` | `GET, PUT, DELETE` | Get, update, or soft/safe delete product |
| `/api/suppliers` | `GET, POST` | List suppliers / Create supplier |
| `/api/suppliers/:id` | `GET, PUT, DELETE` | Get, update, or safe delete supplier |
| `/api/customers` | `GET, POST` | List customers / Create customer |
| `/api/customers/:id` | `GET, PUT, DELETE` | Get, update, or delete customer |
| `/api/purchases` | `GET, POST` | List purchase orders / Create PO & auto-increment stock |
| `/api/purchases/:id` | `GET` | View purchase order details |
| `/api/sales` | `GET, POST` | List sales orders / Create sale with strict stock decrement |
| `/api/sales/:id` | `GET` | View sales order & print invoice |
| `/api/expenses` | `GET, POST` | List expenses (accrual & cash) / Add business expense |
| `/api/expenses/:id` | `GET, PUT, DELETE` | Manage single expense |
| `/api/dashboard` | `GET` | Dynamic KPI calculations, stock alerts, monthly comparisons |
| `/api/reports/profit-loss` | `GET` | Dynamic P&L statement (Revenue, COGS, Gross & Net Margins) |
| `/api/inventory/alerts` | `GET` | Low-stock and out-of-stock item aggregations |

---

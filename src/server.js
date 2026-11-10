const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const { connectDB } = require("./config/db");
const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const customerRoutes = require("./routes/customerRoutes");
const saleRoutes = require("./routes/saleRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const reportRoutes = require("./routes/reportRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Allowed browser origins. CLIENT_URL may be a comma-separated list for
// production (e.g. "https://app.example.com,https://www.example.com").
// Common localhost dev origins are always allowed so the frontend still works
// when Next.js falls back to port 3001 or the browser uses 127.0.0.1.
const configuredOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const devOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

const allowedOrigins = new Set([...configuredOrigins, ...devOrigins]);

// Debug: log allowed origins on startup so you can verify in Render logs
console.log("[CORS] CLIENT_URL env:", process.env.CLIENT_URL);
console.log("[CORS] Allowed origins:", [...allowedOrigins]);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser clients (curl, Postman, server-to-server) which send
    // no Origin header, plus any explicitly allowed origin.
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    // Return false (not an Error) so Express sends a clean 403, not a 500.
    return callback(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

app.use(express.json());
// Handle CORS preflight (OPTIONS) for all routes before any other middleware.
// Use a regex instead of "*" for compatibility with path-to-regexp v8+ (Node 24+).
app.options(/(.*)/, cors(corsOptions));
app.use(cors(corsOptions));

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/inventory", inventoryRoutes);

app.use((error, req, res, next) => {
  if (error && error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
    });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
});

async function startServer() {
  try {
    await connectDB();
  } catch (error) {
    console.error("Database connection failed. Server was not started.");
    console.error(error.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`VENDORA API running on http://localhost:${PORT}`);
  });
}

startServer();

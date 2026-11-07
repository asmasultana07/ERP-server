const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  getSalesReport,
  getPurchaseReport,
  getProfitLossReport,
  getTopProductsReport,
  getCustomerReport,
  getSupplierReport,
  getExpenseReport,
} = require("../controllers/reportController");

const router = express.Router();
router.use(protect);

router.get("/sales", getSalesReport);
router.get("/purchases", getPurchaseReport);
router.get("/profit-loss", getProfitLossReport);
router.get("/top-products", getTopProductsReport);
router.get("/customers", getCustomerReport);
router.get("/suppliers", getSupplierReport);
router.get("/expenses", getExpenseReport);

module.exports = router;

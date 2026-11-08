const express = require("express");
const {
  getDashboardStats,
  getDashboardAnalytics,
} = require("../controllers/dashboardController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/stats", getDashboardStats);
router.get("/analytics", getDashboardAnalytics);

module.exports = router;

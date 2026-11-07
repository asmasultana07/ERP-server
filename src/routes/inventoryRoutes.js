const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getLowStock, getOutOfStock, getInventorySummary } = require("../controllers/inventoryController");

const router = express.Router();
router.use(protect);

router.get("/low-stock", getLowStock);
router.get("/out-of-stock", getOutOfStock);
router.get("/summary", getInventorySummary);

module.exports = router;

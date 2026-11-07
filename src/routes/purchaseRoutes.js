const express = require("express");

const {
  createPurchase,
  getPurchases,
  getPurchase,
  cancelPurchase,
} = require("../controllers/purchaseController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getPurchases).post(createPurchase);
router.route("/:id").get(getPurchase);
router.route("/:id/cancel").patch(cancelPurchase);

module.exports = router;

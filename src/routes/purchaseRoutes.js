const express = require("express");

const {
  createPurchase,
  getPurchases,
  getPurchase,
  updatePurchase,
  cancelPurchase,
} = require("../controllers/purchaseController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getPurchases).post(createPurchase);
router.route("/:id").get(getPurchase).put(updatePurchase);
router.route("/:id/cancel").patch(cancelPurchase);

module.exports = router;

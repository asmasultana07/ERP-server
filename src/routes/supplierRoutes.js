const express = require("express");

const {
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
} = require("../controllers/supplierController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getSuppliers).post(createSupplier);
router.route("/:id").get(getSupplier).put(updateSupplier).delete(deleteSupplier);

module.exports = router;

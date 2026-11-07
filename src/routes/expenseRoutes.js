const express = require("express");

const {
  createExpense,
  getExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
} = require("../controllers/expenseController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.route("/").get(getExpenses).post(createExpense);
router.route("/:id").get(getExpense).put(updateExpense).delete(deleteExpense);

module.exports = router;

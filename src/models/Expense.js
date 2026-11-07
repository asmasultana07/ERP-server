const mongoose = require("mongoose");

const EXPENSE_CATEGORIES = [
  "Rent",
  "Salary",
  "Transport",
  "Utilities",
  "Marketing",
  "Packaging",
  "Maintenance",
  "Other",
];

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Mobile Banking", "Card", "Other"];
const EXPENSE_STATUSES = ["Paid", "Unpaid"];

const expenseSchema = new mongoose.Schema(
  {
    expenseNumber: {
      type: String,
      required: [true, "Expense number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: EXPENSE_CATEGORIES,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "Cash",
    },
    expenseDate: {
      type: Date,
      required: [true, "Expense date is required"],
      default: Date.now,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: EXPENSE_STATUSES,
      default: "Paid",
    },
  },
  { timestamps: true }
);

function toExpense(expense) {
  return {
    id: expense._id,
    expenseNumber: expense.expenseNumber,
    title: expense.title,
    category: expense.category,
    amount: expense.amount,
    paymentMethod: expense.paymentMethod,
    expenseDate: expense.expenseDate,
    description: expense.description || "",
    notes: expense.notes || "",
    status: expense.status,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

module.exports = mongoose.model("Expense", expenseSchema);
module.exports.toExpense = toExpense;
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.EXPENSE_STATUSES = EXPENSE_STATUSES;

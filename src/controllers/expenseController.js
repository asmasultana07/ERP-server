const mongoose = require("mongoose");

const Expense = require("../models/Expense");
const {
  toExpense,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  EXPENSE_STATUSES,
} = require("../models/Expense");
const { parseDateOnly, startOfDay, endOfDay } = require("../utils/dates");

function readBody(req) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return {};
  }
  return req.body;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sendUnexpectedError(res, error) {
  console.error("Expense Controller Error:", error);
  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
}

function isDuplicateNumberError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

async function generateExpenseNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `EXP-${dateStr}-`;
  const latest = await Expense.findOne({
    expenseNumber: new RegExp(`^${prefix}`),
  })
    .sort({ expenseNumber: -1 })
    .collation({ locale: "en", numericOrdering: true });

  let sequence = 1;
  if (latest && latest.expenseNumber) {
    const parts = latest.expenseNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

function validateExpense(body, { partial }) {
  const errors = [];
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has("title")) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) errors.push("Title is required");
    else data.title = title;
  }

  if (!partial || has("category")) {
    const category = typeof body.category === "string" ? body.category.trim() : "";
    if (!EXPENSE_CATEGORIES.includes(category)) {
      errors.push(`Category must be one of: ${EXPENSE_CATEGORIES.join(", ")}`);
    } else {
      data.category = category;
    }
  }

  if (!partial || has("amount")) {
    if (body.amount === undefined || body.amount === "") {
      if (!partial) errors.push("Amount is required");
    } else {
      const amount = Number(body.amount);
      if (typeof body.amount === "boolean" || !Number.isFinite(amount)) {
        errors.push("Amount must be a number");
      } else if (amount <= 0) {
        errors.push("Amount must be greater than 0");
      } else {
        data.amount = Math.round(amount * 100) / 100;
      }
    }
  }

  if (has("paymentMethod") || !partial) {
    const method = has("paymentMethod") ? body.paymentMethod : "Cash";
    if (method === undefined || method === "") {
      data.paymentMethod = "Cash";
    } else if (!PAYMENT_METHODS.includes(method)) {
      errors.push(`Payment method must be one of: ${PAYMENT_METHODS.join(", ")}`);
    } else {
      data.paymentMethod = method;
    }
  }

  if (has("expenseDate") || !partial) {
    if (!has("expenseDate") || body.expenseDate === "" || body.expenseDate === undefined) {
      if (!partial) data.expenseDate = new Date();
    } else {
      const expenseDate = parseDateOnly(body.expenseDate);
      if (!expenseDate) errors.push("Expense date is invalid");
      else data.expenseDate = startOfDay(expenseDate);
    }
  }

  if (has("description")) {
    data.description = typeof body.description === "string" ? body.description.trim() : "";
  }

  if (has("notes")) {
    data.notes = typeof body.notes === "string" ? body.notes.trim() : "";
  }

  if (has("status") || !partial) {
    const status = has("status") && body.status !== undefined && body.status !== ""
      ? body.status
      : "Paid";
    if (!partial || has("status")) {
      if (!EXPENSE_STATUSES.includes(status)) {
        errors.push("Status must be Paid or Unpaid");
      } else if (has("status") || !partial) {
        data.status = status;
      }
    }
  }

  return { data, errors };
}

function buildFilter(query) {
  const filter = {};
  const search = typeof query.search === "string" ? query.search.trim() : "";

  if (search) {
    const pattern = escapeRegex(search);
    filter.$or = [
      { expenseNumber: { $regex: pattern, $options: "i" } },
      { title: { $regex: pattern, $options: "i" } },
    ];
  }

  if (query.category && EXPENSE_CATEGORIES.includes(query.category)) {
    filter.category = query.category;
  }

  if (query.paymentMethod && PAYMENT_METHODS.includes(query.paymentMethod)) {
    filter.paymentMethod = query.paymentMethod;
  }

  if (query.status && EXPENSE_STATUSES.includes(query.status)) {
    filter.status = query.status;
  }

  if (query.startDate || query.endDate) {
    filter.expenseDate = {};
    if (query.startDate) {
      const start = parseDateOnly(query.startDate);
      if (start) filter.expenseDate.$gte = startOfDay(start);
    }
    if (query.endDate) {
      const end = parseDateOnly(query.endDate);
      if (end) filter.expenseDate.$lte = endOfDay(end);
    }
    if (Object.keys(filter.expenseDate).length === 0) delete filter.expenseDate;
  }

  return filter;
}

async function createExpense(req, res) {
  try {
    const { data, errors } = validateExpense(readBody(req), { partial: false });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    data.expenseNumber = await generateExpenseNumber();
    let expense;
    try {
      expense = await Expense.create(data);
    } catch (error) {
      if (isDuplicateNumberError(error)) {
        data.expenseNumber = `EXP-${Date.now().toString().slice(-8)}`;
        expense = await Expense.create(data);
      } else {
        throw error;
      }
    }

    return res.status(201).json({ success: true, expense: toExpense(expense) });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function getExpenses(req, res) {
  try {
    const filter = buildFilter(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [total, expenses, summaryRows] = await Promise.all([
      Expense.countDocuments(filter),
      Expense.find(filter).sort({ expenseDate: -1, createdAt: -1 }).skip(skip).limit(limit),
      Expense.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            paidTotal: {
              $sum: { $cond: [{ $eq: ["$status", "Paid"] }, "$amount", 0] },
            },
            unpaidTotal: {
              $sum: { $cond: [{ $eq: ["$status", "Unpaid"] }, "$amount", 0] },
            },
          },
        },
      ]),
    ]);

    const summary = summaryRows[0] || { totalAmount: 0, paidTotal: 0, unpaidTotal: 0 };

    return res.status(200).json({
      success: true,
      count: expenses.length,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
      summary: {
        totalAmount: Math.round((summary.totalAmount || 0) * 100) / 100,
        paidTotal: Math.round((summary.paidTotal || 0) * 100) / 100,
        unpaidTotal: Math.round((summary.unpaidTotal || 0) * 100) / 100,
      },
      expenses: expenses.map(toExpense),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function getExpense(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid expense id" });
    }

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    return res.status(200).json({ success: true, expense: toExpense(expense) });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function updateExpense(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid expense id" });
    }

    const { data, errors } = validateExpense(readBody(req), { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: "No expense fields to update" });
    }

    const expense = await Expense.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    return res.status(200).json({ success: true, expense: toExpense(expense) });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function deleteExpense(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid expense id" });
    }

    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    return res.status(200).json({ success: true, message: "Expense deleted" });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

module.exports = {
  createExpense,
  getExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
};

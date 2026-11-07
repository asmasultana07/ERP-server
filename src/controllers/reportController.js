const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const Supplier = require("../models/Supplier");
const { resolveRange, trendUnit } = require("../utils/dates");

function getRangeOrError(query, res) {
  const range = resolveRange({
    preset: query.preset || "month",
    startDate: query.startDate,
    endDate: query.endDate,
  });
  if (range.error) {
    res.status(400).json({ success: false, message: range.error });
    return null;
  }
  return range;
}

function r2(n) {
  return Math.round((n || 0) * 100) / 100;
}

// Trend grouping helper
function trendGroupId(unit) {
  if (unit === "day") {
    return {
      year: { $year: "$dateField" },
      month: { $month: "$dateField" },
      day: { $dayOfMonth: "$dateField" },
    };
  }
  if (unit === "week") {
    return {
      year: { $isoWeekYear: "$dateField" },
      week: { $isoWeek: "$dateField" },
    };
  }
  return { year: { $year: "$dateField" }, month: { $month: "$dateField" } };
}

async function getSalesReport(req, res) {
  try {
    const range = getRangeOrError(req.query, res);
    if (!range) return;

    const matchCompleted = {
      status: "Completed",
      saleDate: { $gte: range.start, $lte: range.end },
    };

    const unit = trendUnit(range.start, range.end);

    const [summary, trend] = await Promise.all([
      Sale.aggregate([
        { $match: matchCompleted },
        {
          $group: {
            _id: null,
            totalSales: { $sum: "$totalAmount" },
            totalDiscount: { $sum: "$discount" },
            totalPaid: { $sum: "$paidAmount" },
            totalDue: { $sum: "$dueAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Sale.aggregate([
        { $match: matchCompleted },
        { $addFields: { dateField: "$saleDate" } },
        {
          $group: {
            _id: trendGroupId(unit),
            total: { $sum: "$totalAmount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.week": 1 } },
      ]),
    ]);

    const s = summary[0] || {};
    const count = s.count || 0;

    return res.json({
      success: true,
      range: { preset: range.preset, start: range.start, end: range.end },
      summary: {
        totalSales: r2(s.totalSales),
        count,
        averageSaleValue: count > 0 ? r2(s.totalSales / count) : 0,
        totalDiscount: r2(s.totalDiscount),
        totalPaid: r2(s.totalPaid),
        totalDue: r2(s.totalDue),
      },
      trend,
      trendUnit: unit,
    });
  } catch (err) {
    console.error("getSalesReport:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

async function getPurchaseReport(req, res) {
  try {
    const range = getRangeOrError(req.query, res);
    if (!range) return;

    const matchCompleted = {
      status: "Completed",
      purchaseDate: { $gte: range.start, $lte: range.end },
    };

    const unit = trendUnit(range.start, range.end);

    const [summary, trend] = await Promise.all([
      Purchase.aggregate([
        { $match: matchCompleted },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: "$totalAmount" },
            totalPaid: { $sum: "$paidAmount" },
            totalDue: { $sum: "$dueAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Purchase.aggregate([
        { $match: matchCompleted },
        { $addFields: { dateField: "$purchaseDate" } },
        {
          $group: {
            _id: trendGroupId(unit),
            total: { $sum: "$totalAmount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.week": 1 } },
      ]),
    ]);

    const s = summary[0] || {};

    return res.json({
      success: true,
      range: { preset: range.preset, start: range.start, end: range.end },
      summary: {
        totalPurchases: r2(s.totalPurchases),
        count: s.count || 0,
        totalPaid: r2(s.totalPaid),
        totalDue: r2(s.totalDue),
      },
      trend,
      trendUnit: unit,
    });
  } catch (err) {
    console.error("getPurchaseReport:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

async function getProfitLossReport(req, res) {
  try {
    const range = getRangeOrError(req.query, res);
    if (!range) return;

    const matchSales = {
      status: "Completed",
      saleDate: { $gte: range.start, $lte: range.end },
    };
    const matchExpenses = {
      expenseDate: { $gte: range.start, $lte: range.end },
    };

    const [saleLevelAgg, itemLevelAgg, expensesAgg] = await Promise.all([
      // Pipeline 1: sale-level fields — no $unwind, no overcounting
      Sale.aggregate([
        { $match: matchSales },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$totalAmount" },
            totalDiscount: { $sum: "$discount" },
            totalPaid: { $sum: "$paidAmount" },
          },
        },
      ]),
      // Pipeline 2: item-level COGS — $unwind is correct here
      Sale.aggregate([
        { $match: matchSales },
        { $unwind: "$items" },
        {
          $group: {
            _id: null,
            cogsKnown: {
              $sum: {
                $cond: [
                  { $ne: ["$items.costPriceAtSale", null] },
                  { $multiply: ["$items.costPriceAtSale", "$items.quantity"] },
                  0,
                ],
              },
            },
            cogsUnknownQty: {
              $sum: {
                $cond: [{ $eq: ["$items.costPriceAtSale", null] }, "$items.quantity", 0],
              },
            },
          },
        },
      ]),
      Expense.aggregate([
        { $match: matchExpenses },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: "$amount" },
            paidExpenses: {
              $sum: { $cond: [{ $eq: ["$status", "Paid"] }, "$amount", 0] },
            },
          },
        },
      ]),
    ]);

    const sl = saleLevelAgg[0] || {};
    const il = itemLevelAgg[0] || {};
    const e = expensesAgg[0] || {};

    const revenue = r2(sl.revenue);
    const cogs = r2(il.cogsKnown);
    const hasUnknownCogs = (il.cogsUnknownQty || 0) > 0;
    const grossProfit = r2(revenue - cogs);
    const operatingExpenses = r2(e.totalExpenses);
    const netProfit = r2(grossProfit - operatingExpenses);

    return res.json({
      success: true,
      range: { preset: range.preset, start: range.start, end: range.end },
      profitLoss: {
        revenue,
        cogs,
        cogsIncomplete: hasUnknownCogs,
        grossProfit,
        operatingExpenses,
        paidExpenses: r2(e.paidExpenses),
        netProfit,
        totalPaidByCustomers: r2(sl.totalPaid),
        totalDiscount: r2(sl.totalDiscount),
      },
    });
  } catch (err) {
    console.error("getProfitLossReport:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

async function getTopProductsReport(req, res) {
  try {
    const range = getRangeOrError(req.query, res);
    if (!range) return;

    const products = await Sale.aggregate([
      {
        $match: {
          status: "Completed",
          saleDate: { $gte: range.start, $lte: range.end },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          totalQty: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.subtotal" },
          cogsKnown: {
            $sum: {
              $cond: [
                { $ne: ["$items.costPriceAtSale", null] },
                { $multiply: ["$items.costPriceAtSale", "$items.quantity"] },
                0,
              ],
            },
          },
          hasUnknown: {
            $sum: {
              $cond: [{ $eq: ["$items.costPriceAtSale", null] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productId: "$_id",
          name: { $ifNull: ["$product.name", "Unknown Product"] },
          sku: { $ifNull: ["$product.sku", ""] },
          category: { $ifNull: ["$product.category", ""] },
          totalQty: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] },
          cogs: { $round: ["$cogsKnown", 2] },
          cogsIncomplete: { $gt: ["$hasUnknown", 0] },
          grossProfit: { $round: [{ $subtract: ["$totalRevenue", "$cogsKnown"] }, 2] },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 20 },
    ]);

    return res.json({ success: true, products });
  } catch (err) {
    console.error("getTopProductsReport:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

async function getCustomerReport(req, res) {
  try {
    const range = getRangeOrError(req.query, res);
    if (!range) return;

    const customers = await Sale.aggregate([
      {
        $match: {
          status: "Completed",
          saleDate: { $gte: range.start, $lte: range.end },
        },
      },
      {
        $group: {
          _id: { customer: "$customer", customerName: "$customerName" },
          count: { $sum: 1 },
          totalSales: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          totalDue: { $sum: "$dueAmount" },
        },
      },
      {
        $project: {
          customerId: "$_id.customer",
          customerName: "$_id.customerName",
          count: 1,
          totalSales: { $round: ["$totalSales", 2] },
          totalPaid: { $round: ["$totalPaid", 2] },
          totalDue: { $round: ["$totalDue", 2] },
        },
      },
      { $sort: { totalSales: -1 } },
      { $limit: 50 },
    ]);

    return res.json({ success: true, customers });
  } catch (err) {
    console.error("getCustomerReport:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

async function getSupplierReport(req, res) {
  try {
    const range = getRangeOrError(req.query, res);
    if (!range) return;

    const suppliers = await Purchase.aggregate([
      {
        $match: {
          status: "Completed",
          purchaseDate: { $gte: range.start, $lte: range.end },
        },
      },
      {
        $group: {
          _id: "$supplier",
          count: { $sum: 1 },
          totalPurchases: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          totalDue: { $sum: "$dueAmount" },
        },
      },
      {
        $lookup: {
          from: "suppliers",
          localField: "_id",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          supplierId: "$_id",
          supplierName: { $ifNull: ["$supplier.name", "Unknown Supplier"] },
          count: 1,
          totalPurchases: { $round: ["$totalPurchases", 2] },
          totalPaid: { $round: ["$totalPaid", 2] },
          totalDue: { $round: ["$totalDue", 2] },
        },
      },
      { $sort: { totalPurchases: -1 } },
      { $limit: 50 },
    ]);

    return res.json({ success: true, suppliers });
  } catch (err) {
    console.error("getSupplierReport:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

async function getExpenseReport(req, res) {
  try {
    const range = getRangeOrError(req.query, res);
    if (!range) return;

    const byCategory = await Expense.aggregate([
      {
        $match: {
          expenseDate: { $gte: range.start, $lte: range.end },
        },
      },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    return res.json({ success: true, byCategory });
  } catch (err) {
    console.error("getExpenseReport:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

module.exports = {
  getSalesReport,
  getPurchaseReport,
  getProfitLossReport,
  getTopProductsReport,
  getCustomerReport,
  getSupplierReport,
  getExpenseReport,
};

const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Customer = require("../models/Customer");
const Product = require("../models/Product");
const Expense = require("../models/Expense");
const { resolveRange, trendUnit } = require("../utils/dates");

function r2(n) { return Math.round((n || 0) * 100) / 100; }

function startOfWeekLocal(date) {
  const n = new Date(date);
  n.setHours(0, 0, 0, 0);
  const day = n.getDay();
  n.setDate(n.getDate() - (day === 0 ? 6 : day - 1));
  return n;
}

function bucketStart(date, unit) {
  const d = new Date(date);
  if (unit === "day") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (unit === "week") return startOfWeekLocal(d);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function stepBucket(date, unit) {
  const d = new Date(date);
  if (unit === "day") d.setDate(d.getDate() + 1);
  else if (unit === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function bucketLabel(date, unit) {
  if (unit === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function keyOf(date, unit) {
  return bucketStart(date, unit).getTime();
}

async function getDashboardStats(req, res) {
  try {
    const [
      salesAgg,
      purchasesAgg,
      totalCustomers,
      totalProducts,
      lowStockCount,
      outOfStockCount,
      expensesAgg,
      cogsAgg,
      recentSales,
      recentExpenses,
      lowStockItems,
    ] = await Promise.all([
      Sale.aggregate([
        { $match: { status: "Completed" } },
        { $group: { _id: null, totalSales: { $sum: "$totalAmount" }, totalCustomerDues: { $sum: "$dueAmount" } } },
      ]),
      Purchase.aggregate([
        { $match: { status: "Completed" } },
        { $group: { _id: null, totalPurchases: { $sum: "$totalAmount" } } },
      ]),
      Customer.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true, stockQuantity: { $gt: 0 }, $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] } }),
      Product.countDocuments({ isActive: true, stockQuantity: 0 }),
      Expense.aggregate([
        { $group: { _id: null, totalExpenses: { $sum: "$amount" } } },
      ]),
      Sale.aggregate([
        { $match: { status: "Completed" } },
        { $unwind: "$items" },
        { $match: { "items.costPriceAtSale": { $ne: null } } },
        { $group: { _id: null, cogs: { $sum: { $multiply: ["$items.costPriceAtSale", "$items.quantity"] } } } },
      ]),
      Sale.find({ status: "Completed" }).sort({ saleDate: -1 }).limit(5).select("invoiceNumber customerName totalAmount saleDate paymentStatus").lean(),
      Expense.find().sort({ expenseDate: -1 }).limit(5).select("expenseNumber title category amount expenseDate status").lean(),
      Product.find({ isActive: true, stockQuantity: { $gt: 0 }, $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] } }).sort({ stockQuantity: 1 }).limit(5).select("name sku stockQuantity lowStockThreshold").lean(),
    ]);

    const totalSales = r2(salesAgg[0]?.totalSales);
    const totalCustomerDues = r2(salesAgg[0]?.totalCustomerDues);
    const totalPurchases = r2(purchasesAgg[0]?.totalPurchases);
    const totalExpenses = r2(expensesAgg[0]?.totalExpenses);
    const cogs = r2(cogsAgg[0]?.cogs);
    const grossProfit = r2(totalSales - cogs);
    const netProfit = r2(grossProfit - totalExpenses);

    return res.status(200).json({
      success: true,
      stats: {
        totalSales,
        totalPurchases,
        totalCustomers,
        totalProducts,
        totalCustomerDues,
        lowStockCount,
        outOfStockCount,
        totalExpenses,
        grossProfit,
        netProfit,
      },
      recentSales: recentSales.map((s) => ({
        id: s._id,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        totalAmount: s.totalAmount,
        saleDate: s.saleDate,
        paymentStatus: s.paymentStatus,
      })),
      recentExpenses: recentExpenses.map((e) => ({
        id: e._id,
        expenseNumber: e.expenseNumber,
        title: e.title,
        category: e.category,
        amount: e.amount,
        expenseDate: e.expenseDate,
        status: e.status,
      })),
      lowStockAlerts: lowStockItems.map((p) => ({
        id: p._id,
        name: p.name,
        sku: p.sku,
        stockQuantity: p.stockQuantity,
        lowStockThreshold: p.lowStockThreshold,
      })),
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching dashboard statistics.",
    });
  }
}

async function getDashboardAnalytics(req, res) {
  try {
    const range = resolveRange({
      preset: req.query.preset || "month",
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    if (range.error) {
      return res.status(400).json({ success: false, message: range.error });
    }

    const unit = trendUnit(range.start, range.end);

    const [sales, categoryAgg, customers] = await Promise.all([
      // Real sales inside the range — bucketed in JS so gaps are filled and
      // labels line up with the client's local calendar.
      Sale.find({
        status: "Completed",
        saleDate: { $gte: range.start, $lte: range.end },
      })
        .select("saleDate totalAmount")
        .lean(),
      // Revenue share by product category (real sale items joined to products).
      Sale.aggregate([
        { $match: { status: "Completed", saleDate: { $gte: range.start, $lte: range.end } } },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ["$product.category", ""] },
            revenue: { $sum: "$items.subtotal" },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
      // Customer growth over the last 12 months (independent of the filter).
      Customer.find().select("createdAt").lean(),
    ]);

    // --- Revenue + orders trend (gap-filled buckets) ---
    const map = new Map();
    for (const s of sales) {
      const k = keyOf(s.saleDate, unit);
      const cur = map.get(k) || { revenue: 0, orders: 0 };
      cur.revenue += s.totalAmount || 0;
      cur.orders += 1;
      map.set(k, cur);
    }
    const revenueTrend = [];
    let cursor = bucketStart(range.start, unit);
    const endTime = range.end.getTime();
    let guard = 0;
    while (cursor.getTime() <= endTime && guard < 400) {
      const entry = map.get(cursor.getTime()) || { revenue: 0, orders: 0 };
      revenueTrend.push({
        label: bucketLabel(cursor, unit),
        revenue: r2(entry.revenue),
        orders: entry.orders,
      });
      cursor = stepBucket(cursor, unit);
      guard += 1;
    }

    // --- Category distribution ---
    const categoryDistribution = categoryAgg.map((c) => ({
      category: c._id && String(c._id).trim() ? c._id : "Uncategorized",
      revenue: r2(c.revenue),
    }));

    // --- Customer growth (last 12 months, cumulative) ---
    const now = new Date();
    const firstMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthMap = new Map();
    let priorCumulative = 0;
    for (const c of customers) {
      const created = new Date(c.createdAt);
      if (created < firstMonth) {
        priorCumulative += 1;
      } else {
        const k = new Date(created.getFullYear(), created.getMonth(), 1).getTime();
        monthMap.set(k, (monthMap.get(k) || 0) + 1);
      }
    }
    const customerGrowth = [];
    let cumulative = priorCumulative;
    let mCursor = new Date(firstMonth);
    for (let i = 0; i < 12; i += 1) {
      const added = monthMap.get(mCursor.getTime()) || 0;
      cumulative += added;
      customerGrowth.push({
        label: mCursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        newCustomers: added,
        cumulative,
      });
      mCursor = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 1);
    }

    return res.status(200).json({
      success: true,
      range: { preset: range.preset, start: range.start, end: range.end, unit },
      revenueTrend,
      categoryDistribution,
      customerGrowth,
    });
  } catch (error) {
    console.error("Dashboard Analytics Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching dashboard analytics.",
    });
  }
}

module.exports = {
  getDashboardStats,
  getDashboardAnalytics,
};

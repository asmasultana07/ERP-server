const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Customer = require("../models/Customer");
const Product = require("../models/Product");
const Expense = require("../models/Expense");

function r2(n) { return Math.round((n || 0) * 100) / 100; }

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

module.exports = {
  getDashboardStats,
};

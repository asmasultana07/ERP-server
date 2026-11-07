const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Customer = require("../models/Customer");
const Product = require("../models/Product");

async function getDashboardStats(req, res) {
  try {
    // 1. Total sales & total dues from Completed sales
    const salesAggregate = await Sale.aggregate([
      { $match: { status: "Completed" } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalCustomerDues: { $sum: "$dueAmount" },
          totalSalesCount: { $sum: 1 },
        },
      },
    ]);

    const totalSales =
      salesAggregate.length > 0
        ? Math.round(salesAggregate[0].totalSales * 100) / 100
        : 0;
    const totalCustomerDues =
      salesAggregate.length > 0
        ? Math.round(salesAggregate[0].totalCustomerDues * 100) / 100
        : 0;

    // 2. Total purchases from Completed purchases
    const purchasesAggregate = await Purchase.aggregate([
      { $match: { status: "Completed" } },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: "$totalAmount" },
          totalPurchasesCount: { $sum: 1 },
        },
      },
    ]);

    const totalPurchases =
      purchasesAggregate.length > 0
        ? Math.round(purchasesAggregate[0].totalPurchases * 100) / 100
        : 0;

    // 3. Total active customers
    const totalCustomers = await Customer.countDocuments({ isActive: true });

    // 4. Total active products
    const totalProducts = await Product.countDocuments({ isActive: true });

    // 5. Low-stock products count (active products where stockQuantity <= lowStockThreshold)
    const lowStockCount = await Product.countDocuments({
      isActive: true,
      $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] },
    });

    return res.status(200).json({
      success: true,
      stats: {
        totalSales,
        totalPurchases,
        totalCustomers,
        totalProducts,
        totalCustomerDues,
        lowStockCount,
      },
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

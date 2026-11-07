const Product = require("../models/Product");

async function getLowStock(req, res) {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

    const filter = {
      isActive: true,
      stockQuantity: { $gt: 0 },
      $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] },
    };

    if (search) {
      const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { sku: { $regex: pattern, $options: "i" } },
      ];
    }
    if (category) filter.category = category;

    const products = await Product.find(filter).sort({ stockQuantity: 1 }).lean();

    const items = products.map((p) => ({
      id: p._id,
      name: p.name,
      sku: p.sku,
      category: p.category || "",
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      suggestedReorderQty: Math.max(0, p.lowStockThreshold * 2 - p.stockQuantity),
      unit: p.unit || "pcs",
    }));

    return res.json({ success: true, count: items.length, items });
  } catch (err) {
    console.error("getLowStock:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

async function getOutOfStock(req, res) {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

    const filter = { isActive: true, stockQuantity: 0 };

    if (search) {
      const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { sku: { $regex: pattern, $options: "i" } },
      ];
    }
    if (category) filter.category = category;

    const products = await Product.find(filter).sort({ name: 1 }).lean();

    const items = products.map((p) => ({
      id: p._id,
      name: p.name,
      sku: p.sku,
      category: p.category || "",
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      suggestedReorderQty: p.lowStockThreshold * 2,
      unit: p.unit || "pcs",
    }));

    return res.json({ success: true, count: items.length, items });
  } catch (err) {
    console.error("getOutOfStock:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

async function getInventorySummary(req, res) {
  try {
    const [totalActive, outOfStock, lowStock] = await Promise.all([
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true, stockQuantity: 0 }),
      Product.countDocuments({
        isActive: true,
        stockQuantity: { $gt: 0 },
        $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] },
      }),
    ]);

    return res.json({
      success: true,
      summary: { totalActive, outOfStock, lowStock },
    });
  } catch (err) {
    console.error("getInventorySummary:", err);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}

module.exports = { getLowStock, getOutOfStock, getInventorySummary };

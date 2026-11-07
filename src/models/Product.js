const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    category: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    costPrice: {
      type: Number,
      min: [0, "Cost price cannot be negative"],
      default: 0,
    },
    sellingPrice: {
      type: Number,
      min: [0, "Selling price cannot be negative"],
      default: 0,
    },
    stockQuantity: {
      type: Number,
      min: [0, "Stock quantity cannot be negative"],
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      min: [0, "Low stock threshold cannot be negative"],
      default: 5,
    },
    unit: {
      type: String,
      trim: true,
      default: "pcs",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

function toProduct(product) {
  return {
    id: product._id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    description: product.description,
    costPrice: product.costPrice,
    sellingPrice: product.sellingPrice,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    unit: product.unit,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

module.exports = mongoose.model("Product", productSchema);
module.exports.toProduct = toProduct;

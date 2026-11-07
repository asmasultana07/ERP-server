const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    unitCost: {
      type: Number,
      required: [true, "Unit cost is required"],
      min: [0, "Unit cost cannot be negative"],
    },
    subtotal: {
      type: Number,
      required: [true, "Subtotal is required"],
      min: [0, "Subtotal cannot be negative"],
    },
  },
  { _id: true }
);

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: {
      type: String,
      required: [true, "Purchase number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier is required"],
    },
    purchaseDate: {
      type: Date,
      required: [true, "Purchase date is required"],
      default: Date.now,
    },
    items: {
      type: [purchaseItemSchema],
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: "Purchase must contain at least one item",
      },
    },
    subtotal: {
      type: Number,
      required: [true, "Subtotal is required"],
      min: [0, "Subtotal cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
    },
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Total amount cannot be negative"],
    },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Partial", "Unpaid"],
      default: "Unpaid",
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, "Paid amount cannot be negative"],
    },
    dueAmount: {
      type: Number,
      default: 0,
      min: [0, "Due amount cannot be negative"],
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["Completed", "Cancelled"],
      default: "Completed",
    },
  },
  {
    timestamps: true,
  }
);

function toPurchase(purchase) {
  let supplierData = null;
  if (purchase.supplier) {
    if (typeof purchase.supplier === "object" && purchase.supplier._id) {
      supplierData = {
        id: purchase.supplier._id,
        name: purchase.supplier.name,
        contactPerson: purchase.supplier.contactPerson || "",
        phone: purchase.supplier.phone || "",
        email: purchase.supplier.email || "",
        address: purchase.supplier.address || "",
      };
    } else {
      supplierData = { id: purchase.supplier };
    }
  }

  const itemsData = (purchase.items || []).map((item) => {
    let productData = null;
    if (item.product) {
      if (typeof item.product === "object" && item.product._id) {
        productData = {
          id: item.product._id,
          name: item.product.name,
          sku: item.product.sku,
          category: item.product.category || "",
          unit: item.product.unit || "pcs",
          costPrice: item.product.costPrice,
          sellingPrice: item.product.sellingPrice,
          stockQuantity: item.product.stockQuantity,
        };
      } else {
        productData = { id: item.product };
      }
    }

    return {
      id: item._id,
      product: productData,
      quantity: item.quantity,
      unitCost: item.unitCost,
      subtotal: item.subtotal,
    };
  });

  return {
    id: purchase._id,
    purchaseNumber: purchase.purchaseNumber,
    supplier: supplierData,
    purchaseDate: purchase.purchaseDate,
    items: itemsData,
    subtotal: purchase.subtotal,
    discount: purchase.discount,
    totalAmount: purchase.totalAmount,
    paymentStatus: purchase.paymentStatus,
    paidAmount: purchase.paidAmount,
    dueAmount: purchase.dueAmount,
    notes: purchase.notes || "",
    status: purchase.status,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
  };
}

module.exports = mongoose.model("Purchase", purchaseSchema);
module.exports.toPurchase = toPurchase;

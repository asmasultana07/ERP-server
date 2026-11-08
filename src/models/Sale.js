const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
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
    unitPrice: {
      type: Number,
      required: [true, "Unit price is required"],
      min: [0, "Unit price cannot be negative"],
    },
    costPriceAtSale: {
      type: Number,
      min: [0, "Cost price at sale cannot be negative"],
    },
    subtotal: {
      type: Number,
      required: [true, "Subtotal is required"],
      min: [0, "Subtotal cannot be negative"],
    },
  },
  { _id: true }
);

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      default: "Walk-in Customer",
    },
    saleDate: {
      type: Date,
      required: [true, "Sale date is required"],
      default: Date.now,
    },
    items: {
      type: [saleItemSchema],
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: "Sale must contain at least one item",
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

function toSale(sale) {
  let customerData = null;
  if (sale.customer) {
    if (typeof sale.customer === "object" && sale.customer._id) {
      customerData = {
        id: sale.customer._id,
        name: sale.customer.name,
        phone: sale.customer.phone || "",
        email: sale.customer.email || "",
        address: sale.customer.address || "",
      };
    } else {
      customerData = { id: sale.customer };
    }
  }

  const itemsData = (sale.items || []).map((item) => {
    let productData = null;
    if (item.product) {
      if (typeof item.product === "object" && item.product._id) {
        productData = {
          id: item.product._id,
          name: item.product.name,
          sku: item.product.sku,
          category: item.product.category || "",
          unit: item.product.unit || "pcs",
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
      unitPrice: item.unitPrice,
      costPriceAtSale:
        item.costPriceAtSale === undefined || item.costPriceAtSale === null
          ? null
          : item.costPriceAtSale,
      subtotal: item.subtotal,
    };
  });

  return {
    id: sale._id,
    invoiceNumber: sale.invoiceNumber,
    customer: customerData,
    customerName: sale.customerName || "Walk-in Customer",
    saleDate: sale.saleDate,
    items: itemsData,
    subtotal: sale.subtotal,
    discount: sale.discount,
    totalAmount: sale.totalAmount,
    paymentStatus: sale.paymentStatus,
    paidAmount: sale.paidAmount,
    dueAmount: sale.dueAmount,
    notes: sale.notes || "",
    status: sale.status,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  };
}

// Indexes for reports/dashboard trend queries and product reference lookups.
saleSchema.index({ status: 1, saleDate: -1 });
saleSchema.index({ "items.product": 1 });
saleSchema.index({ customer: 1 });

module.exports = mongoose.model("Sale", saleSchema);
module.exports.toSale = toSale;

const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
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

function toSupplier(supplier) {
  return {
    id: supplier._id,
    name: supplier.name,
    contactPerson: supplier.contactPerson || "",
    phone: supplier.phone || "",
    email: supplier.email || "",
    address: supplier.address || "",
    notes: supplier.notes || "",
    isActive: supplier.isActive !== undefined ? supplier.isActive : true,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  };
}

module.exports = mongoose.model("Supplier", supplierSchema);
module.exports.toSupplier = toSupplier;

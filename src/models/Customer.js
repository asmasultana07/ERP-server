const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
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

function toCustomer(customer) {
  return {
    id: customer._id,
    name: customer.name,
    phone: customer.phone || "",
    email: customer.email || "",
    address: customer.address || "",
    notes: customer.notes || "",
    isActive: customer.isActive !== undefined ? customer.isActive : true,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

customerSchema.index({ createdAt: -1 });
customerSchema.index({ isActive: 1 });

module.exports = mongoose.model("Customer", customerSchema);
module.exports.toCustomer = toCustomer;

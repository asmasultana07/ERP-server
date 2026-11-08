const mongoose = require("mongoose");

const Product = require("../models/Product");
const { toProduct } = require("../models/Product");
const Purchase = require("../models/Purchase");
const Sale = require("../models/Sale");

function readBody(req) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return {};
  }

  return req.body;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumber(value, label, errors, { min = 0 } = {}) {
  if (typeof value === "boolean" || value === null) {
    errors.push(`${label} must be a number`);
    return undefined;
  }

  const number = typeof value === "number" ? value : Number(String(value).trim());

  if (!Number.isFinite(number)) {
    errors.push(`${label} must be a number`);
    return undefined;
  }

  if (number < min) {
    errors.push(`${label} cannot be less than ${min}`);
    return undefined;
  }

  return number;
}

function parseBoolean(value, label, errors) {
  if (typeof value === "boolean") {
    return value;
  }

  errors.push(`${label} must be true or false`);
  return undefined;
}

function validateProduct(body, { partial }) {
  const errors = [];
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has("name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      errors.push("Name is required");
    } else {
      data.name = name;
    }
  }

  if (!partial || has("sku")) {
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";

    if (!sku) {
      errors.push("SKU is required");
    } else {
      data.sku = sku.toUpperCase();
    }
  }

  if (has("category")) {
    data.category = typeof body.category === "string" ? body.category.trim() : "";
  }

  if (has("description")) {
    data.description = typeof body.description === "string" ? body.description.trim() : "";
  }

  if (!partial || has("costPrice")) {
    if (!has("costPrice") && partial) {
      // unchanged
    } else if (body.costPrice === undefined || body.costPrice === "") {
      if (!partial) {
        errors.push("Cost price is required");
      }
    } else {
      const costPrice = parseNumber(body.costPrice, "Cost price", errors);
      if (costPrice !== undefined) {
        data.costPrice = costPrice;
      }
    }
  }

  if (!partial || has("sellingPrice")) {
    if (body.sellingPrice === undefined || body.sellingPrice === "") {
      if (!partial) {
        errors.push("Selling price is required");
      }
    } else if (has("sellingPrice")) {
      const sellingPrice = parseNumber(body.sellingPrice, "Selling price", errors);
      if (sellingPrice !== undefined) {
        data.sellingPrice = sellingPrice;
      }
    }
  }

  if (has("stockQuantity") || !partial) {
    if (body.stockQuantity === undefined || body.stockQuantity === "") {
      if (!partial) {
        data.stockQuantity = 0;
      }
    } else {
      const stockQuantity = parseNumber(body.stockQuantity, "Stock quantity", errors);
      if (stockQuantity !== undefined) {
        data.stockQuantity = stockQuantity;
      }
    }
  }

  if (has("lowStockThreshold")) {
    const lowStockThreshold = parseNumber(
      body.lowStockThreshold,
      "Low stock threshold",
      errors
    );
    if (lowStockThreshold !== undefined) {
      data.lowStockThreshold = lowStockThreshold;
    }
  }

  if (has("unit")) {
    const unit = typeof body.unit === "string" ? body.unit.trim() : "";
    data.unit = unit || "pcs";
  }

  if (has("isActive")) {
    const isActive = parseBoolean(body.isActive, "isActive", errors);
    if (isActive !== undefined) {
      data.isActive = isActive;
    }
  }

  return { data, errors };
}

function isDuplicateSkuError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function sendUnexpectedError(res, error) {
  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
}

function invalidIdResponse(res) {
  return res.status(400).json({
    success: false,
    message: "Invalid product id",
  });
}

async function createProduct(req, res) {
  try {
    const { data, errors } = validateProduct(readBody(req), { partial: false });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    const product = await Product.create(data);

    return res.status(201).json({
      success: true,
      product: toProduct(product),
    });
  } catch (error) {
    if (isDuplicateSkuError(error)) {
      return res.status(409).json({
        success: false,
        message: "A product with this SKU already exists",
      });
    }

    return sendUnexpectedError(res, error);
  }
}

async function getProducts(req, res) {
  try {
    const filter = {};
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

    if (search) {
      const pattern = escapeRegex(search);
      filter.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { sku: { $regex: pattern, $options: "i" } },
      ];
    }

    if (category) {
      filter.category = { $regex: `^${escapeRegex(category)}$`, $options: "i" };
    }

    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      count: products.length,
      products: products.map(toProduct),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function getProduct(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      product: toProduct(product),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function updateProduct(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const body = readBody(req);
    const { data, errors } = validateProduct(body, { partial: true });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No product fields to update",
      });
    }

    const product = await Product.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      product: toProduct(product),
    });
  } catch (error) {
    if (isDuplicateSkuError(error)) {
      return res.status(409).json({
        success: false,
        message: "A product with this SKU already exists",
      });
    }

    return sendUnexpectedError(res, error);
  }
}

async function deleteProduct(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Guard historical referential integrity (audit M1): a product referenced
    // by any Purchase or Sale (including cancelled transactions) must never be
    // hard-deleted, otherwise historical reports and invoices would break.
    const [referencedByPurchase, referencedBySale] = await Promise.all([
      Purchase.exists({ "items.product": product._id }),
      Sale.exists({ "items.product": product._id }),
    ]);

    if (referencedByPurchase || referencedBySale) {
      // Already inactive: nothing more to do, report the preserved state.
      if (product.isActive === false) {
        return res.status(200).json({
          success: true,
          deactivated: true,
          message:
            "Product has existing transaction history and is already inactive. It has been preserved.",
          product: toProduct(product),
        });
      }

      product.isActive = false;
      await product.save();

      return res.status(200).json({
        success: true,
        deactivated: true,
        message:
          "Product was deactivated instead of deleted because it is referenced by existing transaction history.",
        product: toProduct(product),
      });
    }

    await product.deleteOne();

    return res.status(200).json({
      success: true,
      deactivated: false,
      message: "Product deleted",
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
};

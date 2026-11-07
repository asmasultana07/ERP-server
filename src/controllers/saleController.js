const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const { toSale } = require("../models/Sale");
const Product = require("../models/Product");
const Customer = require("../models/Customer");

function readBody(req) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return {};
  }
  return req.body;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTransactionError(error) {
  const message = error?.message || "";
  return /replica set|transaction numbers|transaction is not supported/i.test(message);
}

function sendSaleError(res, error) {
  console.error("Sale Controller Error:", error);

  if (isTransactionError(error)) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }

  if (error?.statusCode === 400) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
}

function sendUnexpectedError(res, error) {
  console.error("Sale Controller Error:", error);
  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
}

function invalidIdResponse(res, entity = "sale") {
  return res.status(400).json({
    success: false,
    message: `Invalid ${entity} id`,
  });
}

async function generateInvoiceNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INV-${dateStr}-`;

  const latest = await Sale.findOne({
    invoiceNumber: new RegExp(`^${prefix}`),
  })
    .sort({ invoiceNumber: -1 })
    .collation({ locale: "en", numericOrdering: true });

  let sequence = 1;
  if (latest && latest.invoiceNumber) {
    const parts = latest.invoiceNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      sequence = lastSeq + 1;
    }
  }

  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

async function createSale(req, res) {
  const body = readBody(req);
  const errors = [];

  // 1. Customer validation (optional, supports walk-in)
  let customerDoc = null;
  let customerName = "Walk-in Customer";

  if (body.customer) {
    if (!mongoose.Types.ObjectId.isValid(body.customer)) {
      errors.push("Invalid customer id");
    } else {
      customerDoc = await Customer.findById(body.customer);
      if (!customerDoc) {
        errors.push("Customer not found");
      } else if (customerDoc.isActive === false) {
        errors.push("Selected customer is inactive");
      } else {
        customerName = customerDoc.name;
      }
    }
  } else if (typeof body.customerName === "string" && body.customerName.trim()) {
    customerName = body.customerName.trim();
  }

  // 2. Sale date
  let saleDate = new Date();
  if (body.saleDate) {
    const parsed = new Date(body.saleDate);
    if (isNaN(parsed.getTime())) {
      errors.push("Invalid sale date");
    } else {
      saleDate = parsed;
    }
  }

  // 3. Items validation
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("Sale must contain at least one item");
  }

  const validatedItems = [];
  const productStock = new Map();

  if (errors.length === 0 && Array.isArray(body.items)) {
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i] || {};
      const rowNum = i + 1;

      if (!item.product) {
        errors.push(`Item #${rowNum}: Product is required`);
        continue;
      }

      if (!mongoose.Types.ObjectId.isValid(item.product)) {
        errors.push(`Item #${rowNum}: Invalid product id`);
        continue;
      }

      const prodIdStr = String(item.product);

      const productDoc = await Product.findById(item.product);
      if (!productDoc) {
        errors.push(`Item #${rowNum}: Product not found`);
        continue;
      }

      if (productDoc.isActive === false) {
        errors.push(`Item #${rowNum}: Product "${productDoc.name}" is inactive`);
        continue;
      }

      productStock.set(prodIdStr, productDoc.stockQuantity);

      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        errors.push(
          `Item #${rowNum}: Quantity must be a positive whole integer (at least 1)`
        );
        continue;
      }

      const unitPrice = Number(item.unitPrice);
      if (typeof item.unitPrice === "boolean" || isNaN(unitPrice) || unitPrice < 0) {
        errors.push(`Item #${rowNum}: Unit price cannot be negative`);
        continue;
      }

      const subtotal = Math.round(qty * unitPrice * 100) / 100;
      const costPriceAtSale =
        Math.round((Number(productDoc.costPrice) || 0) * 100) / 100;

      validatedItems.push({
        product: productDoc._id,
        productName: productDoc.name,
        quantity: qty,
        unitPrice: Math.round(unitPrice * 100) / 100,
        costPriceAtSale,
        subtotal,
      });
    }
  }

  const requestedByProduct = new Map();
  for (const item of validatedItems) {
    const key = String(item.product);
    requestedByProduct.set(key, (requestedByProduct.get(key) || 0) + item.quantity);
  }

  for (const [productId, quantity] of requestedByProduct) {
    const available = productStock.get(productId);
    const name =
      validatedItems.find((item) => String(item.product) === productId)?.productName ||
      "product";
    if (available < quantity) {
      errors.push(
        `Insufficient stock for "${name}". Available: ${available}, Requested: ${quantity}`
      );
    }
  }

  // 4. Financial Calculations
  let discount = 0;
  if (body.discount !== undefined && body.discount !== "") {
    discount = Number(body.discount);
    if (typeof body.discount === "boolean" || isNaN(discount) || discount < 0) {
      errors.push("Discount cannot be negative");
    }
  }
  discount = Math.round(discount * 100) / 100;

  const subtotal = Math.round(
    validatedItems.reduce((acc, it) => acc + it.subtotal, 0) * 100
  ) / 100;

  if (discount > subtotal) {
    errors.push("Discount cannot exceed subtotal");
  }

  const totalAmount = Math.round((subtotal - discount) * 100) / 100;

  let paidAmount = 0;
  if (body.paidAmount !== undefined && body.paidAmount !== "") {
    paidAmount = Number(body.paidAmount);
    if (typeof body.paidAmount === "boolean" || isNaN(paidAmount) || paidAmount < 0) {
      errors.push("Paid amount cannot be negative");
    }
  }
  paidAmount = Math.round(paidAmount * 100) / 100;

  if (paidAmount > totalAmount) {
    errors.push("Paid amount cannot exceed total amount");
  }

  const dueAmount = Math.round((totalAmount - paidAmount) * 100) / 100;

  let paymentStatus = "Unpaid";
  if (paidAmount >= totalAmount) {
    paymentStatus = "Paid";
  } else if (paidAmount > 0) {
    paymentStatus = "Partial";
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors[0],
      errors,
    });
  }

  // 5. Transactional Execution
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    let invoiceNumber = await generateInvoiceNumber();

    const existing = await Sale.findOne({ invoiceNumber }).session(session);
    if (existing) {
      invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
    }

    for (const [productId, quantity] of requestedByProduct) {
      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: productId,
          stockQuantity: { $gte: quantity },
        },
        { $inc: { stockQuantity: -quantity } },
        { session, new: true }
      );

      if (!updatedProduct) {
        const stockError = new Error(
          `Insufficient stock while deducting inventory for product ID: ${productId}`
        );
        stockError.statusCode = 400;
        throw stockError;
      }
    }

    const saleDocData = {
      invoiceNumber,
      customer: customerDoc ? customerDoc._id : null,
      customerName,
      saleDate,
      items: validatedItems.map(
        ({ product, quantity, unitPrice, costPriceAtSale, subtotal }) => ({
          product,
          quantity,
          unitPrice,
          costPriceAtSale,
          subtotal,
        })
      ),
      subtotal,
      discount,
      totalAmount,
      paymentStatus,
      paidAmount,
      dueAmount,
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
      status: "Completed",
    };

    const [createdSale] = await Sale.create([saleDocData], { session });

    await session.commitTransaction();

    const populated = await Sale.findById(createdSale._id)
      .populate("customer")
      .populate("items.product");

    return res.status(201).json({
      success: true,
      sale: toSale(populated),
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    return sendSaleError(res, error);
  } finally {
    if (session) {
      session.endSession();
    }
  }
}

async function getSales(req, res) {
  try {
    const filter = {};

    // 1. Search by invoiceNumber or customerName
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      const pattern = escapeRegex(search);
      filter.$or = [
        { invoiceNumber: { $regex: pattern, $options: "i" } },
        { customerName: { $regex: pattern, $options: "i" } },
      ];
    }

    // 2. Filter by customer
    if (req.query.customer && req.query.customer !== "all") {
      if (req.query.customer === "walk-in") {
        filter.customer = null;
      } else if (mongoose.Types.ObjectId.isValid(req.query.customer)) {
        filter.customer = req.query.customer;
      }
    }

    // 3. Filter by paymentStatus
    if (
      req.query.paymentStatus &&
      ["Paid", "Partial", "Unpaid"].includes(req.query.paymentStatus)
    ) {
      filter.paymentStatus = req.query.paymentStatus;
    }

    // 4. Filter by status
    if (
      req.query.status &&
      ["Completed", "Cancelled"].includes(req.query.status)
    ) {
      filter.status = req.query.status;
    }

    // 5. Date range
    if (req.query.startDate || req.query.endDate) {
      filter.saleDate = {};
      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        start.setHours(0, 0, 0, 0);
        if (!isNaN(start.getTime())) {
          filter.saleDate.$gte = start;
        }
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        if (!isNaN(end.getTime())) {
          filter.saleDate.$lte = end;
        }
      }
      if (Object.keys(filter.saleDate).length === 0) {
        delete filter.saleDate;
      }
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const total = await Sale.countDocuments(filter);
    const sales = await Sale.find(filter)
      .sort({ saleDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customer")
      .populate("items.product");

    return res.status(200).json({
      success: true,
      count: sales.length,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
      sales: sales.map(toSale),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function getSale(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res, "sale");
    }

    const sale = await Sale.findById(req.params.id)
      .populate("customer")
      .populate("items.product");

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found",
      });
    }

    return res.status(200).json({
      success: true,
      sale: toSale(sale),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function cancelSale(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res, "sale");
    }

    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found",
      });
    }

    if (sale.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Sale is already cancelled",
      });
    }

    // Transactional stock restoration
    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      const claimed = await Sale.findOneAndUpdate(
        { _id: sale._id, status: "Completed" },
        { $set: { status: "Cancelled" } },
        { session, new: true }
      );

      if (!claimed) {
        const alreadyCancelled = new Error("Sale is already cancelled");
        alreadyCancelled.statusCode = 400;
        throw alreadyCancelled;
      }

      const restoreByProduct = new Map();
      for (const item of claimed.items) {
        const key = String(item.product);
        restoreByProduct.set(key, (restoreByProduct.get(key) || 0) + item.quantity);
      }

      for (const [productId, quantity] of restoreByProduct) {
        await Product.findByIdAndUpdate(
          productId,
          { $inc: { stockQuantity: quantity } },
          { session }
        );
      }

      await session.commitTransaction();

      const populated = await Sale.findById(sale._id)
        .populate("customer")
        .populate("items.product");

      return res.status(200).json({
        success: true,
        message: "Sale cancelled successfully and stock restored",
        sale: toSale(populated),
      });
    } catch (txError) {
      if (session) {
        await session.abortTransaction();
      }
      return sendSaleError(res, txError);
    } finally {
      if (session) {
        session.endSession();
      }
    }
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

module.exports = {
  createSale,
  getSales,
  getSale,
  cancelSale,
};

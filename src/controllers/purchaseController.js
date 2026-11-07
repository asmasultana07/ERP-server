const mongoose = require("mongoose");
const Purchase = require("../models/Purchase");
const { toPurchase } = require("../models/Purchase");
const Product = require("../models/Product");
const Supplier = require("../models/Supplier");

function readBody(req) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return {};
  }
  return req.body;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sendUnexpectedError(res, error) {
  console.error("Purchase Controller Error:", error);
  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
}

function invalidIdResponse(res, entity = "purchase") {
  return res.status(400).json({
    success: false,
    message: `Invalid ${entity} id`,
  });
}

async function generatePurchaseNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `PUR-${dateStr}-`;

  const latest = await Purchase.findOne({
    purchaseNumber: new RegExp(`^${prefix}`),
  })
    .sort({ purchaseNumber: -1 })
    .collation({ locale: "en", numericOrdering: true });

  let sequence = 1;
  if (latest && latest.purchaseNumber) {
    const parts = latest.purchaseNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      sequence = lastSeq + 1;
    }
  }

  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

async function createPurchase(req, res) {
  const body = readBody(req);
  const errors = [];

  // 1. Supplier validation
  if (!body.supplier) {
    errors.push("Supplier is required");
  } else if (!mongoose.Types.ObjectId.isValid(body.supplier)) {
    errors.push("Invalid supplier id");
  }

  let supplierDoc = null;
  if (errors.length === 0) {
    supplierDoc = await Supplier.findById(body.supplier);
    if (!supplierDoc) {
      errors.push("Supplier not found");
    } else if (supplierDoc.isActive === false) {
      errors.push("Selected supplier is inactive");
    }
  }

  // 2. Purchase date
  let purchaseDate = new Date();
  if (body.purchaseDate) {
    const parsedDate = new Date(body.purchaseDate);
    if (isNaN(parsedDate.getTime())) {
      errors.push("Invalid purchase date");
    } else {
      purchaseDate = parsedDate;
    }
  }

  // 3. Items validation
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("Purchase must contain at least one item");
  }

  const validatedItems = [];
  const seenProductIds = new Set();

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
      if (seenProductIds.has(prodIdStr)) {
        errors.push(
          `Item #${rowNum}: Duplicate product in items list. Please update quantity instead.`
        );
        continue;
      }
      seenProductIds.add(prodIdStr);

      const productDoc = await Product.findById(item.product);
      if (!productDoc) {
        errors.push(`Item #${rowNum}: Product not found`);
        continue;
      }
      if (productDoc.isActive === false) {
        errors.push(
          `Item #${rowNum}: Product "${productDoc.name}" is inactive`
        );
        continue;
      }

      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        errors.push(
          `Item #${rowNum}: Quantity must be a positive whole integer (at least 1)`
        );
        continue;
      }

      const unitCost = Number(item.unitCost);
      if (typeof item.unitCost === "boolean" || isNaN(unitCost) || unitCost < 0) {
        errors.push(`Item #${rowNum}: Unit cost cannot be negative`);
        continue;
      }

      const subtotal = Math.round(qty * unitCost * 100) / 100;
      validatedItems.push({
        product: productDoc._id,
        quantity: qty,
        unitCost: Math.round(unitCost * 100) / 100,
        subtotal,
      });
    }
  }

  // 4. Calculations & Disallow negative numbers
  let discount = 0;
  if (body.discount !== undefined && body.discount !== "") {
    discount = Number(body.discount);
    if (typeof body.discount === "boolean" || isNaN(discount) || discount < 0) {
      errors.push("Discount cannot be negative");
    }
  }
  discount = Math.round(discount * 100) / 100;

  const subtotal = Math.round(
    validatedItems.reduce((acc, item) => acc + item.subtotal, 0) * 100
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

  // 5. Generate unique purchase number & Transactional persistence
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    let purchaseNumber = await generatePurchaseNumber();

    // In case of sequence clash, retry with timestamp suffix
    const existing = await Purchase.findOne({ purchaseNumber }).session(session);
    if (existing) {
      purchaseNumber = `PUR-${Date.now().toString().slice(-8)}`;
    }

    const purchaseDocData = {
      purchaseNumber,
      supplier: supplierDoc._id,
      purchaseDate,
      items: validatedItems,
      subtotal,
      discount,
      totalAmount,
      paymentStatus,
      paidAmount,
      dueAmount,
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
      status: "Completed",
    };

    const [createdPurchase] = await Purchase.create([purchaseDocData], {
      session,
    });

    // Update product stock for each purchased item
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stockQuantity: item.quantity } },
        { session }
      );
    }

    await session.commitTransaction();

    // Populate for clean JSON response
    const populated = await Purchase.findById(createdPurchase._id)
      .populate("supplier")
      .populate("items.product");

    return res.status(201).json({
      success: true,
      purchase: toPurchase(populated),
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    return sendUnexpectedError(res, error);
  } finally {
    if (session) {
      session.endSession();
    }
  }
}

async function getPurchases(req, res) {
  try {
    const filter = {};

    // 1. Search by purchaseNumber
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      filter.purchaseNumber = { $regex: escapeRegex(search), $options: "i" };
    }

    // 2. Filter by supplier
    if (req.query.supplier && req.query.supplier !== "all") {
      if (mongoose.Types.ObjectId.isValid(req.query.supplier)) {
        filter.supplier = req.query.supplier;
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

    // 5. Date range filter
    if (req.query.startDate || req.query.endDate) {
      filter.purchaseDate = {};
      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        start.setHours(0, 0, 0, 0);
        if (!isNaN(start.getTime())) {
          filter.purchaseDate.$gte = start;
        }
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        if (!isNaN(end.getTime())) {
          filter.purchaseDate.$lte = end;
        }
      }
      if (Object.keys(filter.purchaseDate).length === 0) {
        delete filter.purchaseDate;
      }
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const total = await Purchase.countDocuments(filter);
    const purchases = await Purchase.find(filter)
      .sort({ purchaseDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("supplier")
      .populate("items.product");

    return res.status(200).json({
      success: true,
      count: purchases.length,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
      purchases: purchases.map(toPurchase),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function getPurchase(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res, "purchase");
    }

    const purchase = await Purchase.findById(req.params.id)
      .populate("supplier")
      .populate("items.product");

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    return res.status(200).json({
      success: true,
      purchase: toPurchase(purchase),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function cancelPurchase(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res, "purchase");
    }

    const purchase = await Purchase.findById(req.params.id);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    if (purchase.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Purchase is already cancelled",
      });
    }

    // Check if reversing stock would cause any product stock to drop below 0
    for (const item of purchase.items) {
      const prod = await Product.findById(item.product);
      if (!prod) {
        return res.status(400).json({
          success: false,
          message: `Product record not found for item id: ${item.product}`,
        });
      }

      if (prod.stockQuantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel purchase: reversing stock for "${prod.name}" would result in negative inventory (${prod.stockQuantity - item.quantity} available)`,
        });
      }
    }

    // Execute cancellation & stock reversal in a transaction
    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      for (const item of purchase.items) {
        const updated = await Product.findOneAndUpdate(
          {
            _id: item.product,
            stockQuantity: { $gte: item.quantity },
          },
          { $inc: { stockQuantity: -item.quantity } },
          { session, new: true }
        );

        if (!updated) {
          throw new Error(
            `Insufficient stock to reverse product id: ${item.product}`
          );
        }
      }

      purchase.status = "Cancelled";
      await purchase.save({ session });

      await session.commitTransaction();

      const populated = await Purchase.findById(purchase._id)
        .populate("supplier")
        .populate("items.product");

      return res.status(200).json({
        success: true,
        message: "Purchase cancelled successfully",
        purchase: toPurchase(populated),
      });
    } catch (txError) {
      if (session) {
        await session.abortTransaction();
      }
      return res.status(400).json({
        success: false,
        message: txError.message || "Failed to cancel purchase",
      });
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
  createPurchase,
  getPurchases,
  getPurchase,
  cancelPurchase,
};

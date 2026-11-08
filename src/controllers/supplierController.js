const mongoose = require("mongoose");

const Supplier = require("../models/Supplier");
const { toSupplier } = require("../models/Supplier");
const Purchase = require("../models/Purchase");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readBody(req) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return {};
  }

  return req.body;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBoolean(value, label, errors) {
  if (typeof value === "boolean") {
    return value;
  }

  errors.push(`${label} must be true or false`);
  return undefined;
}

function validateSupplier(body, { partial }) {
  const errors = [];
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has("name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      errors.push("Supplier name is required");
    } else {
      data.name = name;
    }
  }

  if (has("contactPerson")) {
    data.contactPerson =
      typeof body.contactPerson === "string" ? body.contactPerson.trim() : "";
  }

  if (has("phone")) {
    data.phone = typeof body.phone === "string" ? body.phone.trim() : "";
  }

  if (has("email")) {
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (email && !EMAIL_PATTERN.test(email)) {
      errors.push("Email must be a valid email address");
    } else {
      data.email = email;
    }
  }

  if (has("address")) {
    data.address = typeof body.address === "string" ? body.address.trim() : "";
  }

  if (has("notes")) {
    data.notes = typeof body.notes === "string" ? body.notes.trim() : "";
  }

  if (has("isActive")) {
    const isActive = parseBoolean(body.isActive, "isActive", errors);
    if (isActive !== undefined) {
      data.isActive = isActive;
    }
  }

  return { data, errors };
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
    message: "Invalid supplier id",
  });
}

async function createSupplier(req, res) {
  try {
    const { data, errors } = validateSupplier(readBody(req), { partial: false });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    const supplier = await Supplier.create(data);

    return res.status(201).json({
      success: true,
      supplier: toSupplier(supplier),
    });
  } catch (error) {
    if (error && (error.code === 11000 || error.code === 11001)) {
      return res.status(409).json({
        success: false,
        message: "A supplier with these details already exists",
      });
    }

    return sendUnexpectedError(res, error);
  }
}

async function getSuppliers(req, res) {
  try {
    const filter = {};
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    if (search) {
      const pattern = escapeRegex(search);
      filter.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { phone: { $regex: pattern, $options: "i" } },
        { email: { $regex: pattern, $options: "i" } },
      ];
    }

    const suppliers = await Supplier.find(filter).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      count: suppliers.length,
      suppliers: suppliers.map(toSupplier),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function getSupplier(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    return res.status(200).json({
      success: true,
      supplier: toSupplier(supplier),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function updateSupplier(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const body = readBody(req);
    const { data, errors } = validateSupplier(body, { partial: true });

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
        message: "No supplier fields to update",
      });
    }

    const supplier = await Supplier.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    return res.status(200).json({
      success: true,
      supplier: toSupplier(supplier),
    });
  } catch (error) {
    if (error && (error.code === 11000 || error.code === 11001)) {
      return res.status(409).json({
        success: false,
        message: "A supplier with these details already exists",
      });
    }

    return sendUnexpectedError(res, error);
  }
}

async function deleteSupplier(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Guard historical referential integrity (audit M2): a supplier referenced
    // by any Purchase (including cancelled purchases) must never be hard-deleted,
    // otherwise historical purchase records and reports would break.
    const referencedByPurchase = await Purchase.exists({
      supplier: supplier._id,
    });

    if (referencedByPurchase) {
      if (supplier.isActive === false) {
        return res.status(200).json({
          success: true,
          deactivated: true,
          message:
            "Supplier has existing purchase history and is already inactive. It has been preserved.",
          supplier: toSupplier(supplier),
        });
      }

      supplier.isActive = false;
      await supplier.save();

      return res.status(200).json({
        success: true,
        deactivated: true,
        message:
          "Supplier was deactivated instead of deleted because it is referenced by existing purchase history.",
        supplier: toSupplier(supplier),
      });
    }

    await supplier.deleteOne();

    return res.status(200).json({
      success: true,
      deactivated: false,
      message: "Supplier deleted",
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

module.exports = {
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
};

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const { toCustomer } = require("../models/Customer");

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

function validateCustomer(body, { partial }) {
  const errors = [];
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has("name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      errors.push("Customer name is required");
    } else {
      data.name = name;
    }
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
  console.error("Customer Controller Error:", error);
  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
}

function invalidIdResponse(res) {
  return res.status(400).json({
    success: false,
    message: "Invalid customer id",
  });
}

async function createCustomer(req, res) {
  try {
    const { data, errors } = validateCustomer(readBody(req), {
      partial: false,
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    const customer = await Customer.create(data);

    return res.status(201).json({
      success: true,
      customer: toCustomer(customer),
    });
  } catch (error) {
    if (error && (error.code === 11000 || error.code === 11001)) {
      return res.status(409).json({
        success: false,
        message: "A customer with these details already exists",
      });
    }
    return sendUnexpectedError(res, error);
  }
}

async function getCustomers(req, res) {
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

    if (req.query.isActive !== undefined && req.query.isActive !== "") {
      filter.isActive = req.query.isActive === "true";
    }

    const customers = await Customer.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: customers.length,
      customers: customers.map(toCustomer),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function getCustomer(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      customer: toCustomer(customer),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function updateCustomer(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const body = readBody(req);
    const { data, errors } = validateCustomer(body, { partial: true });

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
        message: "No customer fields to update",
      });
    }

    const customer = await Customer.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      customer: toCustomer(customer),
    });
  } catch (error) {
    if (error && (error.code === 11000 || error.code === 11001)) {
      return res.status(409).json({
        success: false,
        message: "A customer with these details already exists",
      });
    }
    return sendUnexpectedError(res, error);
  }
}

async function deleteCustomer(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidIdResponse(res);
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Check if customer has associated sales history
    let hasSales = false;
    try {
      const Sale = mongoose.model("Sale");
      hasSales = await Sale.exists({ customer: customer._id });
    } catch {
      hasSales = false;
    }

    if (hasSales) {
      // Deactivate customer rather than breaking sales integrity
      customer.isActive = false;
      await customer.save();

      return res.status(200).json({
        success: true,
        message:
          "Customer has existing sales history and was deactivated instead of permanently deleted",
        customer: toCustomer(customer),
        deactivated: true,
      });
    }

    await Customer.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
};

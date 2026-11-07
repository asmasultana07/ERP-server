const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const SALT_ROUNDS = 12;
const TOKEN_EXPIRES_IN = "7d";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toSafeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function signToken(userId) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    const error = new Error("JWT_SECRET is missing");
    error.statusCode = 500;
    error.publicMessage = "Server configuration error";
    throw error;
  }

  return jwt.sign({ id: userId.toString() }, secret, {
    expiresIn: TOKEN_EXPIRES_IN,
  });
}

function readBody(req) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return {};
  }

  return req.body;
}

function validateRegistration(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const errors = [];

  if (!name) {
    errors.push("Name is required");
  }

  if (!email) {
    errors.push("Email is required");
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push("Email must be a valid email address");
  }

  if (!password) {
    errors.push("Password is required");
  } else if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }

  return { name, email, password, errors };
}

function validateLogin(body) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const errors = [];

  if (!email) {
    errors.push("Email is required");
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push("Email must be a valid email address");
  }

  if (!password) {
    errors.push("Password is required");
  }

  return { email, password, errors };
}

function isDuplicateEmailError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function sendUnexpectedError(res, error) {
  console.error(error);

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.publicMessage || "Something went wrong. Please try again.",
  });
}

async function registerUser(req, res) {
  try {
    const { name, email, password, errors } = validateRegistration(readBody(req));

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });
    const token = signToken(user._id);

    return res.status(201).json({
      success: true,
      token,
      user: toSafeUser(user),
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    return sendUnexpectedError(res, error);
  }
}

async function loginUser(req, res) {
  try {
    const { email, password, errors } = validateLogin(readBody(req));

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = signToken(user._id);

    return res.status(200).json({
      success: true,
      token,
      user: toSafeUser(user),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    return res.status(200).json({
      success: true,
      user: toSafeUser(user),
    });
  } catch (error) {
    return sendUnexpectedError(res, error);
  }
}

module.exports = {
  registerUser,
  loginUser,
  getMe,
};

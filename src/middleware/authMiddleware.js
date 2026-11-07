const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

function protect(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("JWT_SECRET is missing. Refusing to verify tokens.");
    return res.status(500).json({
      success: false,
      message: "Server configuration error",
    });
  }

  try {
    const decoded = jwt.verify(token, secret);

    if (!decoded || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    req.user = { id: decoded.id };
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

module.exports = {
  protect,
};

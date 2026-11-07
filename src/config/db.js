const mongoose = require("mongoose");

const DB_STATUS = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

function getDatabaseStatus() {
  return DB_STATUS[mongoose.connection.readyState] || "unknown";
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is missing. Add it to your .env file before starting the server."
    );
  }

  await mongoose.connect(uri);
  console.log(`MongoDB connected (${mongoose.connection.name})`);
}

module.exports = {
  connectDB,
  getDatabaseStatus,
};

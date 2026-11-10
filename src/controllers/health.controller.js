const { getDatabaseStatus } = require("../config/db");

function getHealth(req, res) {
  res.json({
    success: true,
    message: "VENDORA API is running",
    database: getDatabaseStatus(),
  });
}

module.exports = {
  getHealth,
};

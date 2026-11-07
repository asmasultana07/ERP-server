const { getDatabaseStatus } = require("../config/db");

function getHealth(req, res) {
  res.json({
    success: true,
    message: "Mini ERP API is running",
    database: getDatabaseStatus(),
  });
}

module.exports = {
  getHealth,
};

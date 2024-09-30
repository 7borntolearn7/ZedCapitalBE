const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const Account = require("../Models/Account");
require("dotenv").config({ path: "./.env" });
const dayjs = require('dayjs');

exports.getCounts = async (req, res) => {
  try {
    const userId = req.user.id; 
    const userRole = req.user.role; 

    if (userRole === "agent") {
      const accountCount = await Account.countDocuments({ agentHolder: userId });
      res.json({
        status: "RS_OK",
        data: {
          accountCount,
        },
      });
    } else if (userRole === "admin") {
      // Admin can see total agents and accounts
      const agentCount = await User.countDocuments({ role: "agent" });
      const accountCount = await Account.countDocuments({});

      res.json({
        status: "RS_OK",
        data: {
          agent: agentCount,
          accountCount: accountCount,
        },
      });
    } else {
      // Handle other roles or return a forbidden status
      res.status(403).json({ status: "RS_ERROR", message: "Forbidden" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};

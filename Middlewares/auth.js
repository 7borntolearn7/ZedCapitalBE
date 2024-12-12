const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "./.env" });

exports.auth = async (req, res, next) => {
  try {
    var token = req.header("Authorization");
    if (!token) {
      return res.status(400).send({
        status: "RS_ERROR",
        message: "Token Not Provided",
      });
    }
    token = token.replace("Bearer ", "");
    // Verify Token and populate req.user
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Continue to the next middleware or route
    next();
  } catch (error) {
    console.error("Error occurred during authentication:", error);

    // Handle different types of errors
    if (error.name === "TypeError") {
      return res.status(401).json({
        status: "RS_ERROR",
        message: "Unauthorized User",
      });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        status: "RS_ERROR",
        message: "Token has expired",
      });
    } else if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        status: "RS_ERROR",
        message: "Invalid token",
      });
    } else {
      return res.status(500).json({
        status: "RS_ERROR",
        message: "Internal Server Error",
      });
    }
  }
};

exports.isAdmin = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(401).json({
        success: false,
        message: "This is a protected Route for Admin only",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
  next();
};

exports.isAgent = async (req, res, next) => {
  try {
    if (req.user.role !== "agent") {
      return res.status(401).json({
        success: false,
        message: "This is a protected Route for Agents only",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
  next();
};

exports.isDealer = async (req, res, next) => {
  try {
    if (req.user.role !== "dealer") {
      return res.status(401).json({
        success: false,
        message: "This is a protected Route for Admin only",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
  next();
};
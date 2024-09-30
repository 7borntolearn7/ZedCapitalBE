const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const User = require("../Models/User");
require("dotenv").config({ path: "./.env" });
const dayjs = require('dayjs');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "All fields are required",
      });
    }

    res.clearCookie("token"); 
    const user = await User.findOne({ email });

    if (!user || user.password !== password) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Invalid Email or Password",
      });
    }

    if (user.role === 'agent' && !user.active) {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Your account is inactive. Please contact the administrator.",
      });
    }

    const payload = {
      firstName: user.firstName,
      email: user.email,
      id: user._id,
      role: user.role,
      random: Math.random().toString(36).substr(2), 
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

   
    user.jwtTokens = token;
    await user.save(); 

    let responseData = {
      status: "RS_OK",
      message: "Login successful",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      id: user._id,
      role: user.role,
      active: user.active,
      token: token, 
    };

    res
      .set("Authorization", `Bearer ${token}`)
      .json({ responseData });
  } catch (error) {
    console.error(error);

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        status: "RS_ERROR",
        message: "Token expired",
      });
    }

    // Handle other errors
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};


exports.createAdmin = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      mobile,
      password,
      active,
    } = req.body;

    if (!firstName || !lastName || !email || !password || !mobile) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "First name,Last name, email,mobile and password are required",
      });
    }

    const existingAdmin = await User.findOne({ email });

    if (existingAdmin) {
      return res
        .status(400)
        .json({ status: "RS_ERROR", message: "Admin already exists" });
    }

    const newAdmin = new User({
      firstName,
      lastName,
      email,
      mobile,
      password,
      active,
      role: "admin",
      createdBy: req.user.firstName,
      updatedBy: req.user.firstName,
    });

    const savedAdmin = await newAdmin.save();
    res.json({ status: "RS_OK", data: savedAdmin });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = {};
    const { firstName, lastName, email, mobile,active } = req.body;
    if (firstName) updateFields.firstName = firstName;
    if (lastName) updateFields.lastName = lastName;
    if (email) updateFields.email = email;
    if (mobile) updateFields.mobile = mobile;
    if (typeof active === "boolean") {
      updateFields.active = active.toString();
    } else if (typeof active === "string") {
      updateFields.active = active;
    }
    if (req.user) updateFields.updatedBy = req.user.firstName;

    const updatedAdmin = await User.findByIdAndUpdate(id, updateFields, {
      new: true,
    }).select("-jwtTokens");

    if (!updatedAdmin) {
      return res
        .status(404)
        .json({ status: "RS_ERROR", message: "Admin not found" });
    }

    res.json({ status: "RS_OK", data: updatedAdmin });
  } catch (error) {
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};


exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" }).select("-jwtTokens");

    if (!admins || admins.length === 0) {
      return res
        .status(404)
        .json({ status: "RS_ERROR", message: "No admins found" });
    }

    res.json({ status: "RS_OK", data: admins });
  } catch (error) {
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAdmin = await User.findByIdAndDelete(id);

    if (!deletedAdmin) {
      return res
        .status(404)
        .json({ status: "RS_ERROR", message: "Admin not found" });
    }

    res.json({ status: "RS_OK", message: "Admin deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message:
          "Old password, new password, and confirm password are required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: "RS_ERROR",
        message: "User not found",
      });
    }

    if (user.password !== oldPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Invalid old password",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "New password and confirm password do not match",
      });
    }

    user.password = newPassword;

    await user.save();

    res.json({
      status: "RS_OK",
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};

exports.getCounts = async (req, res) => {
  try {
    const gameCount = await Game.countDocuments();
    const dealerCount = await User.countDocuments({ role: "dealer" });
    const managerCount = await User.countDocuments({ role: "manager" });
    const adminCount = await User.countDocuments({ role: "admin" });

    res.json({
      status: "RS_OK",
      data: {
        games: gameCount,
        dealers: dealerCount,
        manager: managerCount,
        admin: adminCount,
      },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};





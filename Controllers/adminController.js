const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const User = require("../Models/User");
require("dotenv").config({ path: "./.env" });
const bcrypt = require('bcrypt');
const dayjs = require('dayjs');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Email and password are required",
      });
    }

    res.clearCookie("token");

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
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

    const responseData = {
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
      .json(responseData);
  } catch (error) {
    console.error(error);

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        status: "RS_ERROR",
        message: "Token expired",
      });
    }

    // Handle any other errors
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

    // Check for required fields
    if (!firstName || !lastName || !email || !password || !mobile) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "First name, Last name, email, mobile, and password are required",
      });
    }

    // Check if the admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res
        .status(400)
        .json({ status: "RS_ERROR", message: "Admin already exists" });
    }

    // Hash the password before saving it to the database
    const saltRounds = 10;  // 10 is a good balance between security and performance
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create a new admin user
    const newAdmin = new User({
      firstName,
      lastName,
      email,
      mobile,
      password: hashedPassword,  // Store the hashed password
      active,
      role: "admin",
      createdBy: req.user.firstName,
      updatedBy: req.user.firstName,
    });

    // Save the new admin to the database
    const savedAdmin = await newAdmin.save();
    
    // Convert the saved admin to a plain object and exclude the password field
    const { password: _, ...adminData } = savedAdmin.toObject(); // Destructure to remove password

    // Respond with success without the password field
    res.json({ status: "RS_OK", data: adminData });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
}


// exports.updateAdmin = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const updateFields = {};
//     const { firstName, lastName, email, mobile,active } = req.body;
//     if (firstName) updateFields.firstName = firstName;
//     if (lastName) updateFields.lastName = lastName;
//     if (email) updateFields.email = email;
//     if (mobile) updateFields.mobile = mobile;
//     if (typeof active === "boolean") {
//       updateFields.active = active.toString();
//     } else if (typeof active === "string") {
//       updateFields.active = active;
//     }
//     if (req.user) updateFields.updatedBy = req.user.firstName;

//     const updatedAdmin = await User.findByIdAndUpdate(id, updateFields, {
//       new: true,
//     }).select("-jwtTokens");

//     if (!updatedAdmin) {
//       return res
//         .status(404)
//         .json({ status: "RS_ERROR", message: "Admin not found" });
//     }

//     res.json({ status: "RS_OK", data: updatedAdmin });
//   } catch (error) {
//     res
//       .status(500)
//       .json({ status: "RS_ERROR", message: "Internal Server Error" });
//   }
// };


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

// exports.deleteAdmin = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const deletedAdmin = await User.findByIdAndDelete(id);

//     if (!deletedAdmin) {
//       return res
//         .status(404)
//         .json({ status: "RS_ERROR", message: "Admin not found" });
//     }

//     res.json({ status: "RS_OK", message: "Admin deleted successfully" });
//   } catch (error) {
//     res
//       .status(500)
//       .json({ status: "RS_ERROR", message: "Internal Server Error" });
//   }
// };

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


exports.mobilelogin = async (req, res) => {
  try {
    const { email, password, fcmtoken } = req.body;

    if (!email || !password || !fcmtoken) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Email, password, and FCM token are required",
      });
    }

    res.clearCookie("token");

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Invalid Email or Password",
      });
    }

    if (user.role === "agent" && !user.active) {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Your account is inactive. Please contact the administrator.",
      });
    }

    // Add FCM token if not already present
    if (!user.fcmtokens.includes(fcmtoken)) {
      user.fcmtokens.push(fcmtoken);

      // Update all accounts associated with this user to include the new FCM token
      await Account.updateMany(
        { agentHolderId: user._id },
        { $addToSet: { fcmtokens: fcmtoken } }
      );
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

    const responseData = {
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
      .json(responseData);
  } catch (error) {
    console.error(error);

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        status: "RS_ERROR",
        message: "Token expired",
      });
    }

    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};

exports.mobilelogout = async (req, res) => {
  try {
    const { email, fcmtoken } = req.body;

    if (!email || !fcmtoken) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Email and FCM token are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        status: "RS_ERROR",
        message: "User not found",
      });
    }


    user.fcmtokens = user.fcmtokens.filter((token) => token !== fcmtoken);
    user.jwtTokens = null;
    await user.save();

    res.status(200).json({
      status: "RS_OK",
      message: "Logout successful",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};


const User = require("../Models/User");

exports.createAgent = async (req, res) => {
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
        message: "First name, last name, email, mobile, and password are required",
      });
    }

    const existingEmailAgent = await User.findOne({ email });
    if (existingEmailAgent) {
      return res.status(400).json({ status: "RS_ERROR", message: "Agent with this email already exists" });
    }

    const existingMobileAgent = await User.findOne({ mobile });
    if (existingMobileAgent) {
      return res.status(400).json({ status: "RS_ERROR", message: "Agent with this mobile number already exists" });
    }

    const newAgent = new User({
      firstName,
      lastName,
      email,
      mobile,
      password,
      active,
      role: "agent",
      createdBy: req.user.firstName,
      updatedBy: req.user.firstName,
    });

    const savedAgent = await newAgent.save();
    res.json({ status: "RS_OK", data: savedAgent });
  } catch (error) {
    console.log(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};


  exports.updateAgent = async (req, res) => {
    try {
      const { id } = req.params;
      const updateFields = {};
      const { firstName, lastName, email,password, mobile, active } = req.body;
  
      if (email) {
        const existingEmailUser = await User.findOne({ email, _id: { $ne: id } });
        if (existingEmailUser) {
          return res.status(400).json({ status: "RS_ERROR", message: "Email already exists" });
        }
        updateFields.email = email;
      }
      if (mobile) {
        const existingMobileUser = await User.findOne({ mobile, _id: { $ne: id } });
        if (existingMobileUser) {
          return res.status(400).json({ status: "RS_ERROR", message: "Mobile number already exists" });
        }
        updateFields.mobile = mobile;
      }
  
      if (firstName) updateFields.firstName = firstName;
      if (lastName) updateFields.lastName = lastName;
      if (password) updateFields.password = password;
      if (typeof active === "boolean") {
        updateFields.active = active.toString();
      } else if (typeof active === "string") {
        updateFields.active = active;
      }
      if (req.user) updateFields.updatedBy = req.user.firstName;
  
      const updatedAgent = await User.findByIdAndUpdate(id, updateFields, {
        new: true,
      }).select("-jwtTokens");
  
      if (!updatedAgent) {
        return res.status(404).json({ status: "RS_ERROR", message: "Manager not found" });
      }
  
      res.json({ status: "RS_OK", data: updatedAgent });
    } catch (error) {
      console.log(error);
      res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
    }
  };
  
  
  exports.deleteAgent = async (req, res) => {
    try {
      const { id } = req.params;
      const deleteAgent = await User.findByIdAndDelete(id);
  
      if (!deleteAgent) {
        return res
          .status(404)
          .json({ status: "RS_ERROR", message: "Agent not found" });
      }
  
      res.json({ status: "RS_OK", message: "Agent deleted successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ status: "RS_ERROR", message: "Internal Server Error" });
    }
  };
  

  exports.getAllAgents = async (req, res) => {
    try {
      const managers = await User.find({ role: "agent" }).select("-jwtTokens");
  
      if (!managers || managers.length === 0) {
        return res
          .status(404)
          .json({ status: "RS_ERROR", message: "No managers found" });
      }
  
      res.json({ status: "RS_OK", data: managers });
    } catch (error) {
      res
        .status(500)
        .json({ status: "RS_ERROR", message: "Internal Server Error" });
    }
  };
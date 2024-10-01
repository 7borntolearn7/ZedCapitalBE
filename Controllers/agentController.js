const User = require("../Models/User");
const Account= require("../Models/Account");

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
    const { firstName, lastName, email, password, mobile, active } = req.body;
    console.log(id);
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
      updateFields.active = active;
    } else if (typeof active === "string") {
      updateFields.active = active.toLowerCase() === 'true';
    }

    if (req.user) updateFields.updatedBy = req.user.firstName;

    const updatedAgent = await User.findByIdAndUpdate(id, updateFields, {
      new: true,
    }).select("-jwtTokens");

    if (!updatedAgent) {
      return res.status(404).json({ status: "RS_ERROR", message: "Agent not found" });
    }

    // If the agent is set to inactive, update related accounts
    if (updateFields.active === false) {
      try {
        console.log(id);
        const accountsToUpdate = await Account.find();
        console.log("Accounts found for update:", accountsToUpdate); // Double-check what’s being returned
        
        if (accountsToUpdate.length > 0) {
          const bulkOps = accountsToUpdate.map(account => ({
            updateOne: {
              filter: { _id: account._id },
              update: { $set: { active: false } },
            }
          }));
          
          const result = await Account.bulkWrite(bulkOps);
          console.log(result);
        }
      } catch (error) {
        console.error("Error updating accounts:", error);
      }
    }
    

    res.json({ status: "RS_OK", data: updatedAgent,message:"Agent Updated Successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};

exports.deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, update all related accounts to inactive
    await Account.updateMany(
      { agentHolderId: id },
      { $set: { active : false } }
    );

    // Then delete the agent
    const deletedAgent = await User.findByIdAndDelete(id);

    if (!deletedAgent) {
      return res
        .status(404)
        .json({ status: "RS_ERROR", message: "Agent not found" });
    }

    res.json({ status: "RS_OK", message: "Agent deleted successfully and related accounts set to inactive" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};
  

exports.getAllAgents = async (req, res) => {
    try {
      const agents = await User.find({ role: "agent" }).select("-jwtTokens");
  
      if (!agents || agents.length === 0) {
        return res
          .status(404)
          .json({ status: "RS_ERROR", message: "No managers found" });
      }
  
      res.json({ status: "RS_OK", data: agents });
    } catch (error) {
      res
        .status(500)
        .json({ status: "RS_ERROR", message: "Internal Server Error" });
    }
};
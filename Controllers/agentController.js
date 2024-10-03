const User = require("../Models/User");
const Account= require("../Models/Account");
const bcrypt = require('bcrypt');
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

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !mobile) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "First name, last name, email, mobile, and password are required",
      });
    }

    // Check if email or mobile number already exists in a single query
    const existingAgent = await User.findOne({
      $or: [{ email }, { mobile }]
    });

    if (existingAgent) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: existingAgent.email === email
          ? "Agent with this email already exists"
          : "Agent with this mobile number already exists"
      });
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10); // Salt rounds set to 10

    // Create new agent object
    const newAgent = new User({
      firstName,
      lastName,
      email,
      mobile,
      password: hashedPassword, // Store the hashed password
      active,
      role: "agent",
      createdBy: req.user.firstName, // Assuming req.user is populated with the current admin
      updatedBy: req.user.firstName,
    });

    // Save the agent to the database
    const savedAgent = await newAgent.save();

    // Respond with success message
    res.json({
      status: "RS_OK",
      message: "Agent created successfully",
      data: {
        firstName: savedAgent.firstName,
        lastName: savedAgent.lastName,
        email: savedAgent.email,
        mobile: savedAgent.mobile,
        active: savedAgent.active,
        role: savedAgent.role,
      }
    });
  } catch (error) {
    console.error("Error creating agent:", error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};

exports.updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, mobile, active, password } = req.body;
    const updateFields = {};

    console.log(id);

    // Check for existing mobile number if provided
    if (mobile) {
      const existingMobileUser = await User.findOne({ mobile, _id: { $ne: id } });
      if (existingMobileUser) {
        return res.status(400).json({ status: "RS_ERROR", message: "Mobile number already exists" });
      }
      updateFields.mobile = mobile;
    }

    // Update other fields if provided
    if (firstName) updateFields.firstName = firstName;
    if (lastName) updateFields.lastName = lastName;

    // Check if 'active' status is being updated
    if (typeof active === 'boolean' || typeof active === 'string') {
      const isActiveBoolean = typeof active === 'boolean' ? active : active.toLowerCase() === 'true';

      // Check if the password is provided
      if (!password) {
        return res.status(400).json({ status: "RS_ERROR", message: "User password required" });
      }

      // Fetch the logged-in user (req.user should contain the logged-in user's details)
      const loggedInUser = await User.findById(req.user._id);

      // Check if the provided password matches the stored hashed password
      const isPasswordValid = await bcrypt.compare(password, loggedInUser.password);
      if (!isPasswordValid) {
        return res.status(400).json({ status: "RS_ERROR", message: "Incorrect user password" });
      }

      // If the password is valid, proceed with status update
      updateFields.active = isActiveBoolean;
    }

    if (req.user) updateFields.updatedBy = req.user.firstName;

    // Update the agent and exclude the password
    const updatedAgent = await User.findByIdAndUpdate(id, updateFields, {
      new: true,
      select: "-password -jwtTokens", // Exclude password and jwtTokens from the response
    });

    if (!updatedAgent) {
      return res.status(404).json({ status: "RS_ERROR", message: "Agent not found" });
    }

    // If the agent is set to inactive, update related accounts
    if (updateFields.active === false) {
      try {
        console.log(id);
        const accountsToUpdate = await Account.find({ agentHolderId: id }); // Filter accounts related to the agent
        console.log("Accounts found for update:", accountsToUpdate);

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

    res.json({ status: "RS_OK", data: updatedAgent, message: "Agent Updated Successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};


exports.updateAgentPassword = async (req, res) => {
  try {
    const { id } = req.params; 
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Old password, new password, and confirm password are required.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "New password and confirm password do not match.",
      });
    }

    const agent = await User.findById(id);
    if (!agent) {
      return res.status(404).json({ status: "RS_ERROR", message: "Agent not found." });
    }

    const isMatch = await bcrypt.compare(oldPassword, agent.password);
    if (!isMatch) {
      return res.status(400).json({ status: "RS_ERROR", message: "Old password is incorrect." });
    }

    const saltRounds = 10;
    agent.password = await bcrypt.hash(newPassword, saltRounds);

    const updatedAgent = await agent.save();

    res.json({
      status: "RS_OK",
      message: "Password updated successfully.",
      data: {
        id: updatedAgent._id,
        firstName: updatedAgent.firstName,
        lastName: updatedAgent.lastName,
        email: updatedAgent.email,
        mobile: updatedAgent.mobile,
        active: updatedAgent.active,
        role: updatedAgent.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error." });
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
    const agents = await User.find({ role: "agent" }).select("-password -jwtTokens -__v");

    if (!agents || agents.length === 0) {
      return res.status(404).json({ status: "RS_ERROR", message: "No agents found" });
    }

    res.json({ status: "RS_OK", data: agents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};

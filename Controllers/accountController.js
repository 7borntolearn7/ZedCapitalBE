const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const Account = require("../Models/Account");
const User= require("../Models/User");
const TradeAccountInfo = require("../Models/TradeAccountInfo");
const AccountAlert = require("../Models/AccountAlertInfo");
const bcrypt = require('bcrypt');

require("dotenv").config({ path: "./.env" });
const dayjs = require('dayjs');

exports.createAccount = async (req, res) => {
  try {
    const {
      AccountLoginId,
      AccountPassword,
      ServerName,
      EquityType,
      EquityThreshhold,
      messageCheck,
      emailCheck,
      agentId,
      active,
    } = req.body;

    // Ensure all required fields are present
    if (!AccountLoginId || !AccountPassword || !ServerName || !EquityType || !EquityThreshhold) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "All fields are required",
      });
    }

    // Check if an account with the same AccountLoginId already exists
    const existingAccount = await Account.findOne({ AccountLoginId });
    if (existingAccount) {
      return res.status(400).json({ status: "RS_ERROR", message: "Account already exists" });
    }

    let accountHolder = null;
    let agentHolderName = '';

    // Check if the user creating the account is an admin
    if (req.user.role === 'admin') {
      if (!agentId) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Agent ID must be provided when creating an account for an agent",
        });
      }

      // Ensure the provided agentId exists in the database and is active
      const agent = await User.findById(agentId);
      if (!agent || agent.role !== 'agent') {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Invalid agent ID provided",
        });
      }

      // Check if the agent is active
      if (!agent.active) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "The assigned agent is inactive and cannot be assigned to a new account",
        });
      }

      accountHolder = agentId;
      agentHolderName = `${agent.firstName} ${agent.lastName}`;
    } 
    // If the user is an agent, they are the account holder
    else if (req.user.role === 'agent') {
      accountHolder = req.user.id;
      agentHolderName = `${req.user.firstName} ${req.user.lastName}`;
    } 
    else {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Unauthorized to create an account",
      });
    }

    // Hash the AccountPassword for security
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(AccountPassword, saltRounds);

    // Create the new account
    const newAccount = new Account({
      AccountLoginId,
      AccountPassword: hashedPassword, // Save the hashed password
      ServerName,
      EquityType,
      EquityThreshhold,
      messageCheck,
      emailCheck,
      createdBy: req.user.firstName,
      updatedBy: req.user.firstName,
      agentHolderId: accountHolder,
      agentHolderName: agentHolderName,
      active: active !== undefined ? active : true, // Set active to true by default
    });

    // Save the new account to the database
    const savedAccount = await newAccount.save();

    // Remove the password from the response
    const { AccountPassword: _ignored, ...accountResponse } = savedAccount.toObject(); 

    res.status(201).json({
      status: "RS_OK",
      data: accountResponse, // Send the account without the password
      message: "Account Created Successfully",
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};

 
exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = {};
    const {
      AccountLoginId,
      ServerName,
      EquityType,
      EquityThreshhold,
      messageCheck,
      emailCheck,
      agentId,
      active,
      userPassword 
    } = req.body;

    const accountToUpdate = await Account.findById(id);

    if (!accountToUpdate) {
      return res.status(404).json({ status: "RS_ERROR", message: "Account not found" });
    }

    // Check if agentId is provided in the request body
    if (agentId) {
      const agent = await User.findById(agentId);
      if (!agent || agent.role !== 'agent') {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Invalid agent ID provided",
        });
      }

      if (!agent.active) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Cannot update account with an inactive agent",
        });
      }

      updateFields.agentHolderId = agentId;
      updateFields.agentHolderName = `${agent.firstName} ${agent.lastName}`;
    }

    if (!accountToUpdate.active) {
      if (!accountToUpdate.agentHolderId) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Inactive account cannot be updated as it has no agent holder"
        });
      }
    }

    // Role-based authorization checks
    if (req.user.role === 'admin') {
      // Admin can update any account (agentId check handled above)
    } else if (req.user.role === 'agent') {
      // Ensure agents can only update their own accounts
      if (String(accountToUpdate.agentHolderId) !== String(req.user.id)) {
        return res.status(401).json({
          status: "RS_ERROR",
          message: "Unauthorized to update this account",
        });
      }
    } else {
      return res.status(401).json({
        status: "RS_ERROR",
        message: "Unauthorized to update this account",
      });
    }

    // Handle other field updates
    if (AccountLoginId) updateFields.AccountLoginId = AccountLoginId;
    if (ServerName) updateFields.ServerName = ServerName;
    if (EquityType) updateFields.EquityType = EquityType;
    if (EquityThreshhold) updateFields.EquityThreshhold = EquityThreshhold;

    if (typeof messageCheck === "boolean") {
      updateFields.messageCheck = messageCheck;
    } else if (typeof messageCheck === "string") {
      updateFields.messageCheck = messageCheck.toLowerCase() === 'true';
    }

    if (typeof emailCheck === "boolean") {
      updateFields.emailCheck = emailCheck;
    } else if (typeof emailCheck === "string") {
      updateFields.emailCheck = emailCheck.toLowerCase() === 'true';
    }

    // Check if active status is being updated
    if (typeof active === "boolean" || typeof active === "string") {
      const isActiveBoolean = typeof active === 'boolean' ? active : active.toLowerCase() === 'true';

      // Ensure userPassword is provided when updating active status
      if (!userPassword) {
        return res.status(400).json({ status: "RS_ERROR", message: "User password required" });
      }

      // Fetch the logged-in user (req.user should contain the logged-in user's details)
      const loggedInUser = await User.findById(req.user.id);

      // Check if the provided userPassword matches the logged-in user's stored hashed password
      const isPasswordValid = await bcrypt.compare(userPassword, loggedInUser.password);
      if (!isPasswordValid) {
        return res.status(400).json({ status: "RS_ERROR", message: "Incorrect user password" });
      }

      // If the password is valid, proceed with the status update
      updateFields.active = isActiveBoolean;
    }

    if (req.user) updateFields.updatedBy = req.user.firstName;

    // Update the account with the provided fields
    const updatedAccount = await Account.findByIdAndUpdate(id, updateFields, { new: true });

    if (!updatedAccount) {
      return res.status(404).json({ status: "RS_ERROR", message: "Account not found" });
    }

    res.json({ status: "RS_OK", data: updatedAccount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};

exports.updateAccountPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // Ensure all fields are provided
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "All fields are required",
      });
    }

    // Check if new password and confirm password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "New password and confirm password do not match",
      });
    }

    // Find the account using the id parameter
    const account = await Account.findById(id);
    if (!account) {
      return res.status(404).json({
        status: "RS_ERROR",
        message: "Account not found",
      });
    }

    // Ensure the agentHolderId exists in the User collection
    const agent = await User.findById(account.agentHolderId);
    if (!agent) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "No agent associated with this account",
      });
    }

    // Ensure the agent is active
    if (!agent.active) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Cannot update password because the associated agent is inactive",
      });
    }

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, account.AccountPassword);
    if (!isMatch) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Old password is incorrect",
      });
    }

    // Hash the new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update the account's password
    account.AccountPassword = hashedNewPassword;
    await account.save();

    res.json({
      status: "RS_OK",
      message: "Password updated successfully",
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};


  
exports.getAccounts = async (req, res) => {
  try {
    const loggedInUser = req.user;
    let accounts;

    if (loggedInUser.role === 'admin') {
      accounts = await Account.find();
    } else if (loggedInUser.role === 'agent') {
      accounts = await Account.find({ agentHolderId: loggedInUser.id });
    } else {
      return res.status(403).json({ status: "RS_ERROR", message: 'Unauthorized access' });
    }

    // Map accounts without the password
    const accountsData = accounts.map(account => ({
      _id: account._id,
      AccountLoginId: account.AccountLoginId,
      ServerName: account.ServerName,
      EquityType: account.EquityType,
      EquityThreshhold: account.EquityThreshhold,
      messageCheck: account.messageCheck,
      emailCheck: account.emailCheck,
      agentHolderId: account.agentHolderId,
      agentHolderName: account.agentHolderName,
      active: account.active,
      createdOn: account.createdOn,
      updatedOn: account.updatedOn
    }));

    res.json({ status: "RS_OK", data: accountsData });
  } catch (error) {
    console.error('Error in getAccounts:', error);
    res.status(500).json({ status: "RS_ERROR", message: 'Internal server error' });
  }
};


exports.deleteAccount = async (req, res) => {
    try {
      const { userId } = req.params; 
      const { role, id } = req.user; 
  
      const account = await Account.findById(userId);
  
      if (!account) {
        return res
          .status(404)
          .json({ status: "RS_ERROR", message: "Account not found" });
      }
  
      if (role === 'agent' && account.agentHolderId.toString() !== id.toString()) {
        return res
          .status(403)
          .json({ status: "RS_ERROR", message: "Unauthorized to delete this account" });
      }
  
  
      const deletedAccount = await Account.findByIdAndDelete(userId); 
  
      res.json({ status: "RS_OK", message: "Account deleted successfully" });
    } catch (error) {
      console.error('Error deleting account:', error);
      res
        .status(500)
        .json({ status: "RS_ERROR", message: "Internal Server Error" });
    }
};
  
exports.getAccountAlert = async (req, res) => {
  try {
    const loggedInUser = req.user;
    const { accountLoginId } = req.body;
    let accountAlerts;
    if (accountLoginId) {
      const account = await Account.findOne({ AccountLoginId: accountLoginId });
      
      if (!account) {
        return res.status(404).json({
          status: "RS_ERROR",
          message: "Associated account not found",
        });
      }

      if (loggedInUser.role === 'agent' && 
          account.agentHolderId.toString() !== loggedInUser.id.toString()) {
        return res.status(403).json({
          status: "RS_ERROR",
          message: "Unauthorized to access this account alert",
        });
      }

      accountAlerts = await AccountAlert.findOne({ AccountLoginId: accountLoginId });
      
      if (!accountAlerts) {
        return res.status(404).json({
          status: "RS_ERROR",
          message: "Account alert not found",
        });
      }
    } 
    else {
      if (loggedInUser.role === 'admin') {
        // Admin can see all alerts
        accountAlerts = await AccountAlert.find();
      } else if (loggedInUser.role === 'agent') {
        // Get all accounts belonging to the agent
        console.log("kya yaha aaya");
        const agentAccounts = await Account.find({ agentHolderId: loggedInUser.id });
        const accountLoginIds = agentAccounts.map(account => account.AccountLoginId);
        console.log("yeh hai loginIds",accountLoginIds);
        
        // Get alerts for all accounts belonging to the agent
        accountAlerts = await AccountAlert.find({
          AccountLoginId: { $in: accountLoginIds }
        });
      } else {
        return res.status(403).json({
          status: "RS_ERROR",
          message: "Unauthorized access",
        });
      }
    }

    res.json({
      status: "RS_OK",
      data: accountAlerts,
    });

  } catch (error) {
    console.error('Error in getAccountAlert:', error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};

exports.getTradeAccountInfo = async (req, res) => {
  try {
    const loggedInUser = req.user;
    const { accountLoginId } = req.body;
    let tradeAccountInfo;

    // If accountLoginId is provided, fetch specific trade account info
    if (accountLoginId) {
      const account = await Account.findOne({ AccountLoginId: accountLoginId });
      
      if (!account) {
        return res.status(404).json({
          status: "RS_ERROR",
          message: "Associated account not found",
        });
      }

      // Check permissions for specific account
      if (loggedInUser.role === 'agent' && 
          account.agentHolderId.toString() !== loggedInUser.id.toString()) {
        return res.status(403).json({
          status: "RS_ERROR",
          message: "Unauthorized to access this trade account info",
        });
      }

      tradeAccountInfo = await TradeAccountInfo.findOne({ AccountLoginId: accountLoginId });
      
      if (!tradeAccountInfo) {
        return res.status(404).json({
          status: "RS_ERROR",
          message: "Trade account info not found",
        });
      }
    } 
    // If no accountLoginId provided, fetch all trade account info based on role
    else {
      if (loggedInUser.role === 'admin') {
        // Admin can see all trade account info
        tradeAccountInfo = await TradeAccountInfo.find();
      } else if (loggedInUser.role === 'agent') {
        // Get all accounts belonging to the agent
        const agentAccounts = await Account.find({ agentHolderId: loggedInUser.id });
        const accountLoginIds = agentAccounts.map(account => account.AccountLoginId);
        
        // Get trade account info for all accounts belonging to the agent
        tradeAccountInfo = await TradeAccountInfo.find({
          AccountLoginId: { $in: accountLoginIds }
        });
      } else {
        return res.status(403).json({
          status: "RS_ERROR",
          message: "Unauthorized access",
        });
      }
    }

    res.json({
      status: "RS_OK",
      data: tradeAccountInfo,
    });

  } catch (error) {
    console.error('Error in getTradeAccountInfo:', error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};

exports.updateAccountAlert = async (req, res) => {
  try {
    const { id } = req.params;  

    if (!id) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Alert ID is required",
      });
    }

    if (req.user.role !== 'agent') {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Only agents can update account alerts",
      });
    }

    const accountAlert = await AccountAlert.findById(id);

    if (!accountAlert) {
      return res.status(404).json({
        status: "RS_ERROR",
        message: "Account alert not found",
      });
    }

    // Find the associated account using AccountLoginId from the alert
    const account = await Account.findOne({ AccountLoginId: accountAlert.AccountLoginId });
    
    if (!account) {
      return res.status(404).json({
        status: "RS_ERROR",
        message: "Associated account not found",
      });
    }

    // Verify the agent owns this account
    if (account.agentHolderId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Unauthorized to update this account's alert",
      });
    }

    // Check if the alert flag is true
    if (!accountAlert.alertFlag) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Alert flag is already false",
      });
    }

    // Update the alert flag to false, lastChecked to current time, and alertOff to current time
    const currentTime = new Date();
    const updatedAlert = await AccountAlert.findByIdAndUpdate(
      id,
      { 
        alertFlag: false,
        lastChecked: currentTime,
        alertOff: currentTime
      },
      { new: true }
    );

    res.json({
      status: "RS_OK",
      data: updatedAlert,
      message: "Account alert updated successfully",
    });

  } catch (error) {
    console.error('Error in updateAccountAlert:', error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};
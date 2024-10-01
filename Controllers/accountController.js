const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const Account = require("../Models/Account");
const User= require("../Models/User");

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
      active
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
      return res
        .status(400)
        .json({ status: "RS_ERROR", message: "Account already exists" });
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

      // Check if the agent is active, if not, throw an error
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

    // Create the new account
    const newAccount = new Account({
      AccountLoginId,
      AccountPassword,
      ServerName,
      EquityType,
      EquityThreshhold,
      messageCheck,
      emailCheck,
      createdBy: req.user.firstName,
      updatedBy: req.user.firstName,
      agentHolderId: accountHolder,
      agentHolderName: agentHolderName,
      active: active !== undefined ? active : true, 
    });

    // Save the new account to the database
    const savedAccount = await newAccount.save();
    res.json({ status: "RS_OK", data: savedAccount, message: "Account Created Successfully" });

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
      AccountPassword,
      ServerName,
      EquityType,
      EquityThreshhold,
      messageCheck,
      emailCheck,
      agentId,
      active
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

    // If the admin is updating the account, check if the agentId is provided
    if (req.user.role === 'admin') {
      // (The agentId check is already handled above)
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
    if (AccountPassword) updateFields.AccountPassword = AccountPassword;
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

    if (typeof active === "boolean") {
      updateFields.active = active;
    } else if (typeof active === "string") {
      updateFields.active = active.toLowerCase() === 'true';
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


  
  
  
exports.getAccounts = async (req, res) => {
  try {
    const loggedInUser = req.user;
    let accounts;

    if (loggedInUser.role === 'admin') {
      accounts = await Account.find() 
    } else if (loggedInUser.role === 'agent') {
      accounts = await Account.find({ agentHolderId: loggedInUser.id })
    } else {
      return res.status(403).json({ status: "RS_ERROR", message: 'Unauthorized access' });
    }
    const accountsData = accounts.map(account => ({
      _id: account._id,
      AccountLoginId: account.AccountLoginId,
      AccountPassword: account.AccountPassword,
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
  
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
      UpperLimitEquityType,
      UpperLimitEquityThreshhold,
      messageCheck,
      emailCheck,
      UpperLimitMessageCheck,
      UpperLimitEmailCheck,
      agentId,
      active,
    } = req.body;

    const userFcmTokens = req.user.fcmtokens || [];
    // Ensure all required base fields are present
    if (!AccountLoginId || !AccountPassword || !ServerName) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Account login, password and server name are required",
      });
    }

    // Validate equity threshold combinations
    const hasLowerLimit = EquityType && EquityThreshhold !== undefined;
    const hasUpperLimit = UpperLimitEquityType && UpperLimitEquityThreshhold !== undefined;
    const hasIncompleteLimit = (EquityType && !EquityThreshhold) || 
                              (!EquityType && EquityThreshhold !== undefined) ||
                              (UpperLimitEquityType && !UpperLimitEquityThreshhold) || 
                              (!UpperLimitEquityType && UpperLimitEquityThreshhold !== undefined);

    if (!hasLowerLimit && !hasUpperLimit) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "At least one complete limit combination (EquityType + EquityThreshhold) or (UpperLimitEquityType + UpperLimitEquityThreshhold) is required",
      });
    }

    if (hasIncompleteLimit) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Equity type and threshold must be provided together for either lower or upper limits",
      });
    }

    // Validate percentage ranges for lower limit
    if (hasLowerLimit && EquityType === 'percentage') {
      const lowerThreshold = parseFloat(EquityThreshhold);
      if (isNaN(lowerThreshold) || lowerThreshold < 0 || lowerThreshold > 100) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Lower limit equity threshold must be between 0 and 100 when type is percentage",
        });
      }
    }

    // Validate percentage ranges for upper limit
    if (hasUpperLimit && UpperLimitEquityType === 'percentage') {
      const upperThreshold = parseFloat(UpperLimitEquityThreshhold);
      if (isNaN(upperThreshold) || upperThreshold < 0 || upperThreshold > 100) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Upper limit equity threshold must be between 0 and 100 when type is percentage",
        });
      }
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

    // Create the new account with all fields
    const newAccount = new Account({
      AccountLoginId,
      AccountPassword, // Store password as-is without hashing
      ServerName,
      EquityType: hasLowerLimit ? EquityType : undefined,
      EquityThreshhold: hasLowerLimit ? EquityThreshhold : undefined,
      UpperLimitEquityType: hasUpperLimit ? UpperLimitEquityType : undefined,
      UpperLimitEquityThreshhold: hasUpperLimit ? UpperLimitEquityThreshhold : undefined,
      messageCheck: messageCheck !== undefined ? messageCheck : true,
      emailCheck: emailCheck !== undefined ? emailCheck : true,
      UpperLimitMessageCheck: UpperLimitMessageCheck !== undefined ? UpperLimitMessageCheck : true,
      UpperLimitEmailCheck: UpperLimitEmailCheck !== undefined ? UpperLimitEmailCheck : true,
      createdBy: req.user.firstName,
      updatedBy: req.user.firstName,
      agentHolderId: accountHolder,
      agentHolderName: agentHolderName,
      active: active !== undefined ? active : true,
      fcmtokens: userFcmTokens,
    });

    // Save the new account to the database
    const savedAccount = await newAccount.save();

    res.status(201).json({
      status: "RS_OK",
      data: savedAccount,
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
      UpperLimitEquityType,
      UpperLimitEquityThreshhold,
      messageCheck,
      emailCheck,
      UpperLimitMessageCheck,
      UpperLimitEmailCheck,
      agentId,
      active,
      userPassword
    } = req.body;

    const accountToUpdate = await Account.findById(id);

    if (!accountToUpdate) {
      return res.status(404).json({ status: "RS_ERROR", message: "Account not found" });
    }

    // Determine whether to consider lower limits
    const shouldConsiderLowerLimits = 
      accountToUpdate.EquityType !== null || 
      accountToUpdate.EquityThreshhold !== null ||
      EquityType !== undefined ||
      EquityThreshhold !== undefined;

    // Determine whether to consider upper limits
    const shouldConsiderUpperLimits = 
      accountToUpdate.UpperLimitEquityType !== null || 
      accountToUpdate.UpperLimitEquityThreshhold !== null ||
      UpperLimitEquityType !== undefined ||
      UpperLimitEquityThreshhold !== undefined;

    // Get final values for lower limits
    const finalEquityType = shouldConsiderLowerLimits ? 
      (EquityType || accountToUpdate.EquityType) : null;
    const finalEquityThreshhold = shouldConsiderLowerLimits ?
      (EquityThreshhold !== undefined ? EquityThreshhold : accountToUpdate.EquityThreshhold) : null;

    // Get final values for upper limits
    const finalUpperLimitEquityType = shouldConsiderUpperLimits ? 
      (UpperLimitEquityType || accountToUpdate.UpperLimitEquityType) : null;
    const finalUpperLimitEquityThreshhold = shouldConsiderUpperLimits ?
      (UpperLimitEquityThreshhold !== undefined ? UpperLimitEquityThreshhold : accountToUpdate.UpperLimitEquityThreshhold) : null;

    // Validate combinations for both limits
    const hasLowerLimit = shouldConsiderLowerLimits && finalEquityType && finalEquityThreshhold !== undefined;
    const hasUpperLimit = shouldConsiderUpperLimits && finalUpperLimitEquityType && finalUpperLimitEquityThreshhold !== undefined;
    
    // Check for incomplete combinations
    const hasIncompleteLowerLimit = shouldConsiderLowerLimits && 
      ((finalEquityType && finalEquityThreshhold === undefined) || 
       (!finalEquityType && finalEquityThreshhold !== undefined));
                                  
    const hasIncompleteUpperLimit = shouldConsiderUpperLimits && 
      ((finalUpperLimitEquityType && finalUpperLimitEquityThreshhold === undefined) || 
       (!finalUpperLimitEquityType && finalUpperLimitEquityThreshhold !== undefined));

    // Ensure at least one complete limit exists
    if (!hasLowerLimit && !hasUpperLimit) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "At least one complete limit combination must remain after update",
      });
    }

    // Check for incomplete combinations
    if (hasIncompleteLowerLimit || hasIncompleteUpperLimit) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Equity type and threshold must be provided together for either lower or upper limits",
      });
    }

    // Validate percentage ranges for lower limit
    if (shouldConsiderLowerLimits && finalEquityType === 'percentage' && finalEquityThreshhold !== undefined) {
      const threshold = parseFloat(finalEquityThreshhold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Equity threshold must be between 0 and 100 when type is percentage",
        });
      }
    }

    // Validate percentage ranges for upper limit
    if (shouldConsiderUpperLimits && finalUpperLimitEquityType === 'percentage' && finalUpperLimitEquityThreshhold !== undefined) {
      const threshold = parseFloat(finalUpperLimitEquityThreshhold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Upper limit equity threshold must be between 0 and 100 when type is percentage",
        });
      }
    }

    // Handle agent update
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

    // Role-based authorization checks
    if (req.user.role === 'admin') {
      // Admin can update any account
    } else if (req.user.role === 'agent') {
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

    // Update fields if provided
    if (AccountLoginId) updateFields.AccountLoginId = AccountLoginId;
    if (ServerName) updateFields.ServerName = ServerName;

    // Update lower limit fields only if they should be considered
    if (shouldConsiderLowerLimits) {
      if (EquityType) updateFields.EquityType = EquityType;
      if (EquityThreshhold !== undefined) updateFields.EquityThreshhold = EquityThreshhold;
    }
    
    // Update upper limit fields only if they should be considered
    if (shouldConsiderUpperLimits) {
      if (UpperLimitEquityType) updateFields.UpperLimitEquityType = UpperLimitEquityType;
      if (UpperLimitEquityThreshhold !== undefined) updateFields.UpperLimitEquityThreshhold = UpperLimitEquityThreshhold;
    }

    // Handle boolean fields
    if (typeof messageCheck === "boolean" || typeof messageCheck === "string") {
      updateFields.messageCheck = typeof messageCheck === "boolean" ? messageCheck : messageCheck.toLowerCase() === 'true';
    }

    if (typeof emailCheck === "boolean" || typeof emailCheck === "string") {
      updateFields.emailCheck = typeof emailCheck === "boolean" ? emailCheck : emailCheck.toLowerCase() === 'true';
    }

    if (typeof UpperLimitMessageCheck === "boolean" || typeof UpperLimitMessageCheck === "string") {
      updateFields.UpperLimitMessageCheck = typeof UpperLimitMessageCheck === "boolean" ? UpperLimitMessageCheck : UpperLimitMessageCheck.toLowerCase() === 'true';
    }

    if (typeof UpperLimitEmailCheck === "boolean" || typeof UpperLimitEmailCheck === "string") {
      updateFields.UpperLimitEmailCheck = typeof UpperLimitEmailCheck === "boolean" ? UpperLimitEmailCheck : UpperLimitEmailCheck.toLowerCase() === 'true';
    }

    // Handle active status update
    if (typeof active === "boolean" || typeof active === "string") {
      const isActiveBoolean = typeof active === 'boolean' ? active : active.toLowerCase() === 'true';

      if (!userPassword) {
        return res.status(400).json({ status: "RS_ERROR", message: "User password required" });
      }

      const loggedInUser = await User.findById(req.user.id);
      const isPasswordValid = await bcrypt.compare(userPassword, loggedInUser.password);
      
      if (!isPasswordValid) {
        return res.status(400).json({ status: "RS_ERROR", message: "Incorrect user password" });
      }

      updateFields.active = isActiveBoolean;
    }

    if (req.user) updateFields.updatedBy = req.user.firstName;
    updateFields.updatedOn = Date.now();

    // Update the account
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

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "All fields are required",
      });
    }
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

    // Verify old password (direct comparison since passwords aren't hashed)
    if (oldPassword !== account.AccountPassword) {
      return res.status(400).json({
        status: "RS_ERROR",
        message: "Old password is incorrect",
      });
    }

    // Update the account's password with the new password directly
    account.AccountPassword = newPassword;
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
      UpperLimitEquityType:account.UpperLimitEquityType,
      UpperLimitEquityThreshhold:account.UpperLimitEquityThreshhold,
      messageCheck: account.messageCheck,
      emailCheck: account.emailCheck,
      UpperLimitMessageCheck:account.UpperLimitMessageCheck,
      UpperLimitEmailCheck:account.UpperLimitEmailCheck,
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

exports.updateAccountMobile = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = {};
    const {
      AccountPassword,
      ServerName,
      EquityType,
      EquityThreshhold,
      UpperLimitEquityType,
      UpperLimitEquityThreshhold,
      messageCheck,
      emailCheck,
      UpperLimitMessageCheck,
      UpperLimitEmailCheck,
      active,
    } = req.body;

    const accountToUpdate = await Account.findById(id);

    if (!accountToUpdate) {
      return res.status(404).json({ status: "RS_ERROR", message: "Account not found" });
    }


    if (req.user.role === 'admin') {

    } else if (req.user.role === 'agent') {
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


    if (AccountPassword) updateFields.AccountPassword = AccountPassword;
    if (ServerName) updateFields.ServerName = ServerName;
    if (EquityType) updateFields.EquityType = EquityType;
    if (EquityThreshhold !== undefined) updateFields.EquityThreshhold = EquityThreshhold;
    if (UpperLimitEquityType) updateFields.UpperLimitEquityType = UpperLimitEquityType;
    if (UpperLimitEquityThreshhold !== undefined) updateFields.UpperLimitEquityThreshhold = UpperLimitEquityThreshhold;


    if (typeof messageCheck === "boolean" || typeof messageCheck === "string") {
      updateFields.messageCheck = typeof messageCheck === "boolean" ? messageCheck : messageCheck.toLowerCase() === 'true';
    }
    if (typeof emailCheck === "boolean" || typeof emailCheck === "string") {
      updateFields.emailCheck = typeof emailCheck === "boolean" ? emailCheck : emailCheck.toLowerCase() === 'true';
    }
    if (typeof UpperLimitMessageCheck === "boolean" || typeof UpperLimitMessageCheck === "string") {
      updateFields.UpperLimitMessageCheck = typeof UpperLimitMessageCheck === "boolean" ? UpperLimitMessageCheck : UpperLimitMessageCheck.toLowerCase() === 'true';
    }
    if (typeof UpperLimitEmailCheck === "boolean" || typeof UpperLimitEmailCheck === "string") {
      updateFields.UpperLimitEmailCheck = typeof UpperLimitEmailCheck === "boolean" ? UpperLimitEmailCheck : UpperLimitEmailCheck.toLowerCase() === 'true';
    }
    if (typeof active === "boolean" || typeof active === "string") {
      updateFields.active = typeof active === "boolean" ? active : active.toLowerCase() === 'true';
    }

    if (req.user) updateFields.updatedBy = req.user.firstName;
    updateFields.updatedOn = Date.now();

    const updatedAccount = await Account.findByIdAndUpdate(id, updateFields, { new: true });

    if (!updatedAccount) {
      return res.status(404).json({ status: "RS_ERROR", message: "Account not found" });
    }

    res.json({
      status: "RS_OK",
      data: updatedAccount,
      message: "Account updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "RS_ERROR", message: "Internal Server Error" });
  }
};


const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const Account = require("../Models/Account");
const User = require("../Models/User");
const TradeAccountInfo = require("../Models/TradeAccountInfo");
const { MobileAlarmsLog } = require("../Models/MobileAlarms");
const AccountAlert = require("../Models/AccountAlertInfo");
const bcrypt = require("bcrypt");
const { createMobileAlarmLogEntry } = require("../Models/MobileAlarms");
require("dotenv").config({ path: "./.env" });
const dayjs = require("dayjs");

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
    const hasUpperLimit =
      UpperLimitEquityType && UpperLimitEquityThreshhold !== undefined;
    const hasIncompleteLimit =
      (EquityType && !EquityThreshhold) ||
      (!EquityType && EquityThreshhold !== undefined) ||
      (UpperLimitEquityType && !UpperLimitEquityThreshhold) ||
      (!UpperLimitEquityType && UpperLimitEquityThreshhold !== undefined);

    if (!hasLowerLimit && !hasUpperLimit) {
      return res.status(400).json({
        status: "RS_ERROR",
        message:
          "At least one complete limit combination (EquityType + EquityThreshhold) or (UpperLimitEquityType + UpperLimitEquityThreshhold) is required",
      });
    }

    if (hasIncompleteLimit) {
      return res.status(400).json({
        status: "RS_ERROR",
        message:
          "Equity type and threshold must be provided together for either lower or upper limits",
      });
    }

    // Validate percentage ranges for lower limit
    if (hasLowerLimit && EquityType === "percentage") {
      const lowerThreshold = parseFloat(EquityThreshhold);
      if (isNaN(lowerThreshold) || lowerThreshold < 0 || lowerThreshold > 100) {
        return res.status(400).json({
          status: "RS_ERROR",
          message:
            "Lower limit equity threshold must be between 0 and 100 when type is percentage",
        });
      }
    }

    // Validate percentage ranges for upper limit
    if (hasUpperLimit && UpperLimitEquityType === "percentage") {
      const upperThreshold = parseFloat(UpperLimitEquityThreshhold);
      if (isNaN(upperThreshold) || upperThreshold < 0 || upperThreshold > 100) {
        return res.status(400).json({
          status: "RS_ERROR",
          message:
            "Upper limit equity threshold must be between 0 and 100 when type is percentage",
        });
      }
    }

    // New validation for equity thresholds when types are the same
    if (hasLowerLimit && hasUpperLimit && EquityType === UpperLimitEquityType) {
      const lowerThreshold = parseFloat(EquityThreshhold);
      const upperThreshold = parseFloat(UpperLimitEquityThreshhold);

      if (EquityType === "fixed") {
        if (upperThreshold < lowerThreshold) {
          return res.status(400).json({
            status: "RS_ERROR",
            message:
              "Upper limit equity threshold cannot be less than lower limit equity threshold when type is fixed",
          });
        }
      } else if (EquityType === "percentage") {
        if (upperThreshold < lowerThreshold) {
          return res.status(400).json({
            status: "RS_ERROR",
            message:
              "Upper limit equity threshold cannot be less than lower limit equity threshold when type is percentage",
          });
        }
      }
    }

    // Check if an account with the same AccountLoginId already exists
    const existingAccount = await Account.findOne({ AccountLoginId });
    if (existingAccount) {
      return res
        .status(400)
        .json({ status: "RS_ERROR", message: "Account already exists" });
    }

    let accountHolder = null;
    let agentHolderName = "";

    // Check if the user creating the account is an admin
    if (req.user.role === "admin") {
      if (!agentId) {
        return res.status(400).json({
          status: "RS_ERROR",
          message:
            "Agent ID must be provided when creating an account for an agent",
        });
      }

      const agent = await User.findById(agentId);
      if (!agent || agent.role !== "agent") {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "Invalid agent ID provided",
        });
      }

      if (!agent.active) {
        return res.status(400).json({
          status: "RS_ERROR",
          message:
            "The assigned agent is inactive and cannot be assigned to a new account",
        });
      }

      accountHolder = agentId;
      agentHolderName = `${agent.firstName}`;
    } else if (req.user.role === "agent") {
      accountHolder = req.user.id;
      agentHolderName = `${req.user.firstName}`;
    } else {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Unauthorized to create an account",
      });
    }

    // Determine the mobileAlert field value
    const existingAccountsForAgent = await Account.find({
      agentHolderId: accountHolder,
    });

    let mobileAlert = true;
    if (existingAccountsForAgent.length > 0) {
      const allWithMobileAlertTrue = existingAccountsForAgent.every(
        (account) => account.mobileAlert === true
      );
      const allWithMobileAlertFalse = existingAccountsForAgent.every(
        (account) => account.mobileAlert === false
      );

      if (allWithMobileAlertTrue) {
        mobileAlert = true;
      } else if (allWithMobileAlertFalse) {
        mobileAlert = false;
      }
    }

    const newAccount = new Account({
      AccountLoginId,
      AccountPassword,
      ServerName,
      EquityType: hasLowerLimit ? EquityType : undefined,
      EquityThreshhold: hasLowerLimit ? EquityThreshhold : undefined,
      UpperLimitEquityType: hasUpperLimit ? UpperLimitEquityType : undefined,
      UpperLimitEquityThreshhold: hasUpperLimit
        ? UpperLimitEquityThreshhold
        : undefined,
      messageCheck: messageCheck !== undefined ? messageCheck : true,
      emailCheck: emailCheck !== undefined ? emailCheck : true,
      UpperLimitMessageCheck:
        UpperLimitMessageCheck !== undefined ? UpperLimitMessageCheck : true,
      UpperLimitEmailCheck:
        UpperLimitEmailCheck !== undefined ? UpperLimitEmailCheck : true,
      mobileAlert,
      createdBy: req.user.firstName,
      updatedBy: req.user.firstName,
      agentHolderId: accountHolder,
      agentHolderName: agentHolderName,
      active: active !== undefined ? active : false,
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
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal Server Error" });
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
      userPassword,
    } = req.body;

    const accountToUpdate = await Account.findById(id);

    if (!accountToUpdate) {
      return res
        .status(404)
        .json({ status: "RS_ERROR", message: "Account not found" });
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
    const finalEquityType = shouldConsiderLowerLimits
      ? EquityType || accountToUpdate.EquityType
      : null;
    const finalEquityThreshhold = shouldConsiderLowerLimits
      ? EquityThreshhold !== undefined
        ? EquityThreshhold
        : accountToUpdate.EquityThreshhold
      : null;

    // Get final values for upper limits
    const finalUpperLimitEquityType = shouldConsiderUpperLimits
      ? UpperLimitEquityType || accountToUpdate.UpperLimitEquityType
      : null;
    const finalUpperLimitEquityThreshhold = shouldConsiderUpperLimits
      ? UpperLimitEquityThreshhold !== undefined
        ? UpperLimitEquityThreshhold
        : accountToUpdate.UpperLimitEquityThreshhold
      : null;

    // Validate combinations for both limits
    const hasLowerLimit =
      shouldConsiderLowerLimits &&
      finalEquityType &&
      finalEquityThreshhold !== undefined;
    const hasUpperLimit =
      shouldConsiderUpperLimits &&
      finalUpperLimitEquityType &&
      finalUpperLimitEquityThreshhold !== undefined;

    // Check for incomplete combinations
    const hasIncompleteLowerLimit =
      shouldConsiderLowerLimits &&
      ((finalEquityType && finalEquityThreshhold === undefined) ||
        (!finalEquityType && finalEquityThreshhold !== undefined));

    const hasIncompleteUpperLimit =
      shouldConsiderUpperLimits &&
      ((finalUpperLimitEquityType &&
        finalUpperLimitEquityThreshhold === undefined) ||
        (!finalUpperLimitEquityType &&
          finalUpperLimitEquityThreshhold !== undefined));

    // Ensure at least one complete limit exists
    if (!hasLowerLimit && !hasUpperLimit) {
      return res.status(400).json({
        status: "RS_ERROR",
        message:
          "At least one complete limit combination must remain after update",
      });
    }

    // Check for incomplete combinations
    if (hasIncompleteLowerLimit || hasIncompleteUpperLimit) {
      return res.status(400).json({
        status: "RS_ERROR",
        message:
          "Equity type and threshold must be provided together for either lower or upper limits",
      });
    }

    // Validate percentage ranges for lower limit
    if (
      shouldConsiderLowerLimits &&
      finalEquityType === "percentage" &&
      finalEquityThreshhold !== undefined
    ) {
      const threshold = parseFloat(finalEquityThreshhold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return res.status(400).json({
          status: "RS_ERROR",
          message:
            "Equity threshold must be between 0 and 100 when type is percentage",
        });
      }
    }

    // Validate percentage ranges for upper limit
    if (
      shouldConsiderUpperLimits &&
      finalUpperLimitEquityType === "percentage" &&
      finalUpperLimitEquityThreshhold !== undefined
    ) {
      const threshold = parseFloat(finalUpperLimitEquityThreshhold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return res.status(400).json({
          status: "RS_ERROR",
          message:
            "Upper limit equity threshold must be between 0 and 100 when type is percentage",
        });
      }
    }

    if (
      hasLowerLimit &&
      hasUpperLimit &&
      finalEquityType === finalUpperLimitEquityType
    ) {
      const lowerThreshold = parseFloat(finalEquityThreshhold);
      const upperThreshold = parseFloat(finalUpperLimitEquityThreshhold);

      if (finalEquityType === "fixed") {
        if (upperThreshold < lowerThreshold) {
          return res.status(400).json({
            status: "RS_ERROR",
            message:
              "Upper limit equity threshold cannot be less than lower limit equity threshold when type is fixed",
          });
        }
      } else if (finalEquityType === "percentage") {
        if (upperThreshold < lowerThreshold) {
          return res.status(400).json({
            status: "RS_ERROR",
            message:
              "Upper limit equity threshold cannot be less than lower limit equity threshold when type is percentage",
          });
        }
      }
    }

    // Handle agent update
    if (agentId) {
      const agent = await User.findById(agentId);
      if (!agent || agent.role !== "agent") {
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
    if (req.user.role === "admin") {
      // Admin can update any account
    } else if (req.user.role === "agent") {
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
      if (EquityThreshhold !== undefined)
        updateFields.EquityThreshhold = EquityThreshhold;
    }

    // Update upper limit fields only if they should be considered
    if (shouldConsiderUpperLimits) {
      if (UpperLimitEquityType)
        updateFields.UpperLimitEquityType = UpperLimitEquityType;
      if (UpperLimitEquityThreshhold !== undefined)
        updateFields.UpperLimitEquityThreshhold = UpperLimitEquityThreshhold;
    }

    // Handle boolean fields
    if (typeof messageCheck === "boolean" || typeof messageCheck === "string") {
      updateFields.messageCheck =
        typeof messageCheck === "boolean"
          ? messageCheck
          : messageCheck.toLowerCase() === "true";
    }

    if (typeof emailCheck === "boolean" || typeof emailCheck === "string") {
      updateFields.emailCheck =
        typeof emailCheck === "boolean"
          ? emailCheck
          : emailCheck.toLowerCase() === "true";
    }

    if (
      typeof UpperLimitMessageCheck === "boolean" ||
      typeof UpperLimitMessageCheck === "string"
    ) {
      updateFields.UpperLimitMessageCheck =
        typeof UpperLimitMessageCheck === "boolean"
          ? UpperLimitMessageCheck
          : UpperLimitMessageCheck.toLowerCase() === "true";
    }

    if (
      typeof UpperLimitEmailCheck === "boolean" ||
      typeof UpperLimitEmailCheck === "string"
    ) {
      updateFields.UpperLimitEmailCheck =
        typeof UpperLimitEmailCheck === "boolean"
          ? UpperLimitEmailCheck
          : UpperLimitEmailCheck.toLowerCase() === "true";
    }

    // Handle active status update
    if (typeof active === "boolean" || typeof active === "string") {
      const isActiveBoolean =
        typeof active === "boolean" ? active : active.toLowerCase() === "true";

      if (!userPassword) {
        return res
          .status(400)
          .json({ status: "RS_ERROR", message: "User password required" });
      }

      const loggedInUser = await User.findById(req.user.id);
      const isPasswordValid = await bcrypt.compare(
        userPassword,
        loggedInUser.password
      );

      if (!isPasswordValid) {
        return res
          .status(400)
          .json({ status: "RS_ERROR", message: "Incorrect user password" });
      }

      updateFields.active = isActiveBoolean;
    }

    if (req.user) updateFields.updatedBy = req.user.firstName;
    updateFields.updatedOn = Date.now();

    // Update the account
    const updatedAccount = await Account.findByIdAndUpdate(id, updateFields, {
      new: true,
    });

    if (!updatedAccount) {
      return res
        .status(404)
        .json({ status: "RS_ERROR", message: "Account not found" });
    }

    res.json({ status: "RS_OK", data: updatedAccount });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal Server Error" });
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
        message:
          "Cannot update password because the associated agent is inactive",
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

    if (loggedInUser.role === "admin") {
      accounts = await Account.find();
    } else if (loggedInUser.role === "agent") {
      accounts = await Account.find({ agentHolderId: loggedInUser.id });
    } else {
      return res
        .status(403)
        .json({ status: "RS_ERROR", message: "Unauthorized access" });
    }

    // Map accounts without the password
    const accountsData = accounts.map((account) => ({
      _id: account._id,
      AccountLoginId: account.AccountLoginId,
      ServerName: account.ServerName,
      EquityType: account.EquityType,
      EquityThreshhold: account.EquityThreshhold,
      UpperLimitEquityType: account.UpperLimitEquityType,
      UpperLimitEquityThreshhold: account.UpperLimitEquityThreshhold,
      messageCheck: account.messageCheck,
      emailCheck: account.emailCheck,
      UpperLimitMessageCheck: account.UpperLimitMessageCheck,
      UpperLimitEmailCheck: account.UpperLimitEmailCheck,
      agentHolderId: account.agentHolderId,
      agentHolderName: account.agentHolderName,
      active: account.active,
      mobileAlert: account.mobileAlert,
      createdOn: account.createdOn,
      updatedOn: account.updatedOn,
    }));

    res.json({ status: "RS_OK", data: accountsData });
  } catch (error) {
    console.error("Error in getAccounts:", error);
    res
      .status(500)
      .json({ status: "RS_ERROR", message: "Internal server error" });
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

    if (
      role === "agent" &&
      account.agentHolderId.toString() !== id.toString()
    ) {
      return res
        .status(403)
        .json({
          status: "RS_ERROR",
          message: "Unauthorized to delete this account",
        });
    }

    const deletedAccount = await Account.findByIdAndDelete(userId);

    res.json({ status: "RS_OK", message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
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

      if (
        loggedInUser.role === "agent" &&
        account.agentHolderId.toString() !== loggedInUser.id.toString()
      ) {
        return res.status(403).json({
          status: "RS_ERROR",
          message: "Unauthorized to access this account alert",
        });
      }

      accountAlerts = await AccountAlert.findOne({
        AccountLoginId: accountLoginId,
      });

      if (!accountAlerts) {
        return res.status(404).json({
          status: "RS_ERROR",
          message: "Account alert not found",
        });
      }
    } else {
      if (loggedInUser.role === "admin") {
        accountAlerts = await AccountAlert.find();
      } else if (loggedInUser.role === "agent") {
        const agentAccounts = await Account.find({
          agentHolderId: loggedInUser.id,
        });
        const accountLoginIds = agentAccounts.map(
          (account) => account.AccountLoginId
        );
        accountAlerts = await AccountAlert.find({
          AccountLoginId: { $in: accountLoginIds },
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
    console.error("Error in getAccountAlert:", error);
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
      if (
        loggedInUser.role === "agent" &&
        account.agentHolderId.toString() !== loggedInUser.id.toString()
      ) {
        return res.status(403).json({
          status: "RS_ERROR",
          message: "Unauthorized to access this trade account info",
        });
      }

      tradeAccountInfo = await TradeAccountInfo.findOne({
        AccountLoginId: accountLoginId,
      });

      if (!tradeAccountInfo) {
        return res.status(404).json({
          status: "RS_ERROR",
          message: "Trade account info not found",
        });
      }
    }
    // If no accountLoginId provided, fetch all trade account info based on role
    else {
      if (loggedInUser.role === "admin") {
        // Admin can see all trade account info
        tradeAccountInfo = await TradeAccountInfo.find();
      } else if (loggedInUser.role === "agent") {
        // Get all accounts belonging to the agent
        const agentAccounts = await Account.find({
          agentHolderId: loggedInUser.id,
        });
        const accountLoginIds = agentAccounts.map(
          (account) => account.AccountLoginId
        );

        // Get trade account info for all accounts belonging to the agent
        tradeAccountInfo = await TradeAccountInfo.find({
          AccountLoginId: { $in: accountLoginIds },
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
    console.error("Error in getTradeAccountInfo:", error);
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

    if (req.user.role !== "agent") {
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
    const account = await Account.findOne({
      AccountLoginId: accountAlert.AccountLoginId,
    });

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
        alertOff: currentTime,
      },
      { new: true }
    );

    res.json({
      status: "RS_OK",
      data: updatedAlert,
      message: "Account alert updated successfully",
    });
  } catch (error) {
    console.error("Error in updateAccountAlert:", error);
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
      return res
        .status(404)
        .json({ status: "RS_ERROR", message: "Account not found" });
    }
    const authorizeUpdate = (user, account) => {
      if (user.role === "admin") return true;
      if (user.role === "agent") {
        return String(account.agentHolderId) === String(user.id);
      }
      return false;
    };

    if (!authorizeUpdate(req.user, accountToUpdate)) {
      return res.status(401).json({
        status: "RS_ERROR",
        message: "Unauthorized to update this account",
      });
    }

    // Validate Equity Thresholds
    const validateEquityThreshold = (type, threshold) => {
      if (type === "percentage") {
        if (threshold !== undefined) {
          if (threshold < 0 || threshold > 100) {
            throw new Error("Percentage threshold must be between 0 and 100");
          }
        }
      }
      return threshold;
    };

    // Prepare update fields
    if (AccountPassword) updateFields.AccountPassword = AccountPassword;
    if (ServerName) updateFields.ServerName = ServerName;

    // Validate and set Equity Type and Thresholds
    const currentEquityType = EquityType || accountToUpdate.EquityType;
    const currentUpperLimitEquityType =
      UpperLimitEquityType || accountToUpdate.UpperLimitEquityType;
    let currentEquityThreshhold =
      EquityThreshhold !== undefined
        ? validateEquityThreshold(currentEquityType, EquityThreshhold)
        : accountToUpdate.EquityThreshhold;
     let currentUpperLimitEquityThreshhold =
      UpperLimitEquityThreshhold !== undefined
        ? validateEquityThreshold(
            currentUpperLimitEquityType,
            UpperLimitEquityThreshhold
          )
        : accountToUpdate.UpperLimitEquityThreshhold;
    if (
      (currentEquityType === "fixed" &&
        currentUpperLimitEquityType === "fixed") ||
      (currentEquityType === "percentage" &&
        currentUpperLimitEquityType === "percentage")
    ) {
      currentUpperLimitEquityThreshhold = parseFloat(currentUpperLimitEquityThreshhold);
      currentEquityThreshhold = parseFloat(currentEquityThreshhold);
      if (currentUpperLimitEquityThreshhold < currentEquityThreshhold) {
        return res.status(400).json({
          status: "RS_ERROR",
          message:
            "Upper limit equity threshold cannot be less than lower limit equity threshold",
        });
      }
    }
    if (EquityType) updateFields.EquityType = EquityType;
    if (EquityThreshhold !== undefined) {
      updateFields.EquityThreshhold = currentEquityThreshhold;
    }

    if (UpperLimitEquityType)
      updateFields.UpperLimitEquityType = UpperLimitEquityType;
    if (UpperLimitEquityThreshhold !== undefined) {
      updateFields.UpperLimitEquityThreshhold =
        currentUpperLimitEquityThreshhold;
    }
    const booleanFields = {
      messageCheck,
      emailCheck,
      UpperLimitMessageCheck,
      UpperLimitEmailCheck,
      active,
    };

    for (const [key, value] of Object.entries(booleanFields)) {
      if (value !== undefined) {
        updateFields[key] =
          typeof value === "boolean" ? value : value.toLowerCase() === "true";
      }
    }

    if (req.user) updateFields.updatedBy = req.user.firstName;
    updateFields.updatedOn = Date.now();

  
    const updatedAccount = await Account.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true, 
    });

    if (!updatedAccount) {
      return res
        .status(404)
        .json({ status: "RS_ERROR", message: "Account not found" });
    }

    res.json({
      status: "RS_OK",
      data: updatedAccount,
      message: "Account updated successfully",
    });
  } catch (error) {
    console.error("Error updating account:", error.message);

    // Handle specific validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        status: "RS_ERROR",
        message: error.message,
      });
    }

    res.status(500).json({
      status: "RS_ERROR",
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getMobileAlertAccounts = async (req, res) => {
  try {
    if (req.user.role !== "agent") {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Unauthorized to access mobile alert accounts",
      });
    }
    const [singleAccount] = await Account.find({
      agentHolderId: req.user.id,
    })
      .select("AccountLoginId mobileAlert")
      .limit(1);

    const remainingCount = await Account.countDocuments({
      agentHolderId: req.user.id,
    });
    res.status(200).json({
      status: "RS_OK",
      data: {
        account: singleAccount || null,
        remainingCount: singleAccount ? remainingCount - 1 : remainingCount,
      },
      message: "Mobile Alert Account Retrieved Successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};

exports.toggleAgentMobileAlerts = async (req, res) => {
  try {
    if (req.user.role !== "agent") {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Unauthorized to modify mobile alerts",
      });
    }

    // Fetch accounts belonging to the agent
    const accountsToUpdate = await Account.find({
      agentHolderId: req.user.id,
    });

    if (!accountsToUpdate.length) {
      return res.status(404).json({
        status: "RS_ERROR",
        message: "No accounts found for the agent",
      });
    }

    // Update each account and create logs for changes
    const updateResults = await Promise.all(
      accountsToUpdate.map(async (account) => {
        // Toggle the mobileAlert status
        const newStatus = !account.mobileAlert;

        // Update the account
        await Account.updateOne(
          { _id: account._id },
          {
            $set: {
              mobileAlert: newStatus,
              updatedBy: req.user.firstName,
              updatedOn: new Date(),
            },
          }
        );

        // Log the change
        await createMobileAlarmLogEntry(account, newStatus);

        return { accountId: account._id, newStatus };
      })
    );

    res.status(200).json({
      status: "RS_OK",
      data: {
        updatedAccounts: updateResults.length,
        changes: updateResults,
      },
      message: "Mobile Alerts Toggled Successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal Server Error",
    });
  }
};

exports.getMobileAlarmLogs = async (req, res) => {
  try {
    const loggedInUser = req.user;

    if (loggedInUser.role !== "admin") {
      return res.status(403).json({
        status: "RS_ERROR",
        message: "Unauthorized access. Admin rights required.",
      });
    }
    const {
      page = 1,
      limit = 10,
      search,
      status,
      startDate,
      endDate,
    } = req.body;

    const skip = (page - 1) * limit;

    const searchQuery = search
      ? {
          $or: [{ accountLoginId: { $regex: search, $options: "i" } }],
        }
      : {};

    const statusFilter =
      status !== undefined && status !== null
        ? { mobileAlertStatus: status === true }
        : {};

    const dateFilter = {};
    if (startDate) {
      dateFilter.changedOn = { $gte: new Date(startDate) };
    }
    if (endDate) {
      dateFilter.changedOn = {
        ...dateFilter.changedOn,
        $lte: new Date(endDate),
      };
    }

    const combinedFilter = {
      ...searchQuery,
      ...statusFilter,
      ...dateFilter,
    };

    const mobileAlarmLogs = await MobileAlarmsLog.find(combinedFilter)
      .populate({
        path: "accountId",
        select: "AccountLoginId ServerName agentHolderName",
      })
      .populate({
        path: "agentHolderId",
        select: "name email",
      })
      .sort({ changedOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalLogs = await MobileAlarmsLog.countDocuments(combinedFilter);

    res.json({
      status: "RS_OK",
      data: {
        logs: mobileAlarmLogs.map((log) => ({
          _id: log._id,
          accountLoginId: log.accountLoginId,
          accountDetails: {
            serverName: log.accountId?.ServerName,
            agentHolderName: log.accountId?.agentHolderName,
          },
          agentHolder: {
            name: log.agentHolderId?.name,
            email: log.agentHolderId?.email,
          },
          mobileAlertStatus: log.mobileAlertStatus,
          changedOn: log.changedOn,
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalLogs / limit),
          totalLogs: totalLogs,
          logsPerPage: limit,
        },
      },
      message: "Accounts Log Fetched Successfully",
    });
  } catch (error) {
    console.error("Error in getMobileAlarmLogs:", error);
    res.status(500).json({
      status: "RS_ERROR",
      message: "Internal server error",
    });
  }
};

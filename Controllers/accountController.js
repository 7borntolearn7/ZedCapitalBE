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
      } = req.body;
  
      if (!AccountLoginId || !AccountPassword || !ServerName || !EquityType || !EquityThreshhold) {
        return res.status(400).json({
          status: "RS_ERROR",
          message: "All Fields are required",
        });
      }
  
      const existingAccount = await Account.findOne({ AccountLoginId });
      if (existingAccount) {
        return res
          .status(400)
          .json({ status: "RS_ERROR", message: "Account already exists" });
      }
  
      let accountHolder = null;
  
      if (req.user.role === 'admin') {
        if (!agentId) {
          return res.status(400).json({
            status: "RS_ERROR",
            message: "Agent ID must be provided when creating an account for an agent",
          });
        }
  
        // Ensure the provided agentId exists in the database
        const agent = await User.findById(agentId);
        if (!agent || agent.role !== 'agent') {
          return res.status(400).json({
            status: "RS_ERROR",
            message: "Invalid agent ID provided",
          });
        }
  
        accountHolder = agentId; 
      } else if (req.user.role === 'agent') {
        // If the user is an agent, they are the account holder
        accountHolder = req.user.id;
      } else {
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
        agentHolder: accountHolder, 
      });
  
      // Save the new account
      const savedAccount = await newAccount.save();
      res.json({ status: "RS_OK", data: savedAccount });
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
        AccountPassword,
        ServerName,
        EquityType,
        EquityThreshhold,
        messageCheck,
        emailCheck,
        agentId, 
      } = req.body;
  
      if (AccountLoginId) updateFields.AccountLoginId = AccountLoginId;
      if (AccountPassword) updateFields.AccountPassword = AccountPassword;
      if (ServerName) updateFields.ServerName = ServerName;
      if (EquityType) updateFields.EquityType = EquityType;
      if (EquityThreshhold) updateFields.EquityThreshhold = EquityThreshhold;
      if (typeof messageCheck === "boolean") {
        updateFields.messageCheck = messageCheck.toString();
      } else if (typeof messageCheck === "string") {
        updateFields.messageCheck = messageCheck;
      }
      
      if (typeof emailCheck === "boolean") {
        updateFields.emailCheck = emailCheck.toString();
      } else if (typeof emailCheck === "string") {
        updateFields.emailCheck = emailCheck;
      }
  
      if (req.user) updateFields.updatedBy = req.user.firstName;
  
      const accountToUpdate = await Account.findById(id);
  
      if (!accountToUpdate) {
        return res.status(404).json({ status: "RS_ERROR", message: "Account not found" });
      }
  
      if (req.user.role === 'admin') {
        if (agentId) {
          const agent = await User.findById(agentId);
          if (!agent || agent.role !== 'agent') {
            return res.status(400).json({
              status: "RS_ERROR",
              message: "Invalid agent ID provided",
            });
          }
          updateFields.agentHolder = agentId; 
        }
      } else if (req.user.role === 'agent') {
        if (String(accountToUpdate.agentHolder) !== String(req.user.id)) {
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
      const { role, id } = req.user;
      let accounts;
      if (role === 'admin') {
        accounts = await Account.find().populate('agentHolder', 'firstName lastName');
      } 
      else if (role === 'agent') {
        accounts = await Account.find({ agentHolder: id }).populate('agentHolder', 'firstName lastName');
      } 
      else {
        return res.status(403).json({
          status: 'RS_ERROR',
          message: 'Unauthorized to view accounts',
        });
      }
  
      if (!accounts.length) {
        return res.status(404).json({
          status: 'RS_OK',
          message: 'No accounts found',
        });
      }
  
      const formattedAccounts = accounts.map(account => ({
        ...account.toObject(),
        agentName: `${account.agentHolder.firstName} ${account.agentHolder.lastName}`, 
      }));
      res.json({
        status: 'RS_OK',
        data: formattedAccounts,
      });
    } catch (error) {
      console.error('Error fetching accounts:', error);
      res.status(500).json({
        status: 'RS_ERROR',
        message: 'Internal Server Error',
      });
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
  
      if (role === 'agent' && account.agentHolder.toString() !== id.toString()) {
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
  
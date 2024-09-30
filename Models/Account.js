const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AccountSchema = new Schema({
  AccountLoginId: {
    type: String,
    required: true,
    unique: true,
  },
  AccountPassword: {
    type: String,
    required: true,
  },
  ServerName: {
    type: String,
    required: true,
  },
  EquityType: {
    type: String,
    enum: ["fixed", "percentage"],
    required: true,
  },
  EquityThreshhold: {
    type: Number,
    default: 0,
    required: true,
  },
  messageCheck: {
    type: Boolean,
    required: true,
    default: false,
  },
  emailCheck: {
    type: Boolean,
    required: true,
    default: false,
  },
  
  agentHolder: {
    type: Schema.Types.ObjectId,
    ref: "User", 
    required: true,
  },
  createdOn: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: String,
  },
  updatedOn: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
  },
});

// Indexing for faster search of accounts by agentHolder
AccountSchema.index({ agentHolder: 1 });

const Account = mongoose.model("Account", AccountSchema);

module.exports = Account;

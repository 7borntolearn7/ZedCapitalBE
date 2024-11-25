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
    default: null
  },
  EquityThreshhold: {
    type: Number,
    default: null,
  },
  UpperLimitEquityType:{
    type: String,
    enum: ["fixed","percentage"],
    default: null
  },
  UpperLimitEquityThreshhold:{
    type: Number,
    default: null,
  },
  messageCheck: {
    type: Boolean,
    default: true,
  },
  emailCheck: {
    type: Boolean,
    default: true,
  },
  UpperLimitMessageCheck:{
    type: Boolean,
    default: true,
  },
  UpperLimitEmailCheck:{
    type: Boolean,
    default: true,
  }
,
  agentHolderId: {
    type: Schema.Types.ObjectId,
    ref: "User", 
    required: true,
  },
  agentHolderName:{
    type: String,
    ref:"User",
    required:true,
  },
  active:{
    type:Boolean,
    required:true,
    default:false
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
  fcmtokens: {
    type: [String], 
    default: [],    
  },
});

// Indexing for faster search of accounts by agentHolder
AccountSchema.index({ agentHolder: 1 });

const Account = mongoose.model("Account", AccountSchema);

module.exports = Account;

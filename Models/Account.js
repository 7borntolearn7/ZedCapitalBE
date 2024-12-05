const mongoose = require("mongoose");
require("mongoose-double")(mongoose);
const Schema = mongoose.Schema;
const SchemaTypes = mongoose.Schema.Types;
const { getUTCTime }  = require("../Utils/commonUtils");

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
  },
  mobileAlert: {
    type: Boolean,
    default: true,
  },
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
    default: getUTCTime,
  },
  createdBy: {
    type: String,
  },
  updatedOn: {
    type: Date,
    default: getUTCTime,
  },
  updatedBy: {
    type: String,
  },
  fcmtokens: {
    type: [String], 
    default: [],    
  },
});

AccountSchema.index({ agentHolder: 1 });

const Account = mongoose.model("Account", AccountSchema);

module.exports = Account;

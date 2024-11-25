const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  role: {
    type: String,
    enum: ["admin", "agent"],
    required: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  mobile: {
    type: String,
    default: "Mobile details not provided",
  },
  password: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  jwtTokens: {
    type: String,
    default: null,
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

const User = mongoose.model("User", UserSchema);

module.exports = User;
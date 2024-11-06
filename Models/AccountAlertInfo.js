const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AccountAlertSchema = new Schema({
    AccountLoginId: {
        type: String,
        required: true,
        unique: true,
      },
    alertFlag:{
        type:Boolean,
        required:true,
    },
    alertOff:{
        type:Date,
        required:true
    },
    alertOn:{
        type:Date,
        required:true
    },
    lastChecked:{
        type:Date,
        required:true
    }
})

const AccountAlert = mongoose.model("AccountAlert", AccountAlertSchema, "accountAlert");

module.exports = AccountAlert;
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { getUTCTime }  = require("../Utils/commonUtils");

const MobileAlarmsSchema = new Schema({
  accountId: {
    type: Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },
  accountLoginId: {
    type: String,
    required: true
  },
  agentHolderId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  mobileAlertStatus: {
    type: Boolean,
    required: true
  },
  changedOn: {
    type: Date,
    required: true,
    default: getUTCTime,
    expires: 14 * 24 * 60 * 60  
  },
},{ strict: true });

MobileAlarmsSchema.index({ accountId: 1, changedOn: -1 });
MobileAlarmsSchema.index({ changedOn: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

const MobileAlarmsLog = mongoose.model("MobileAlertLog", MobileAlarmsSchema);

const createMobileAlarmLogEntry = async (account, mobileAlertStatus) => {
  try {
    console.log("yeh hai account",account);
    console.log("Yeh hai mobileAlertStatus",mobileAlertStatus);
    await MobileAlarmsLog.create({
      accountId: account._id,
      accountLoginId: account.AccountLoginId,
      agentHolderId: account.agentHolderId,
      mobileAlertStatus: mobileAlertStatus,
      changedOn: getUTCTime(), 
    });
  } catch (error) {
    console.error('Error creating mobile alert log entry:', error);
  }
};

module.exports = {
MobileAlarmsLog,
createMobileAlarmLogEntry
};
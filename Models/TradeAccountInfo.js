const mongoose = require("mongoose");
require("mongoose-double")(mongoose);
const Schema = mongoose.Schema;
const SchemaTypes = mongoose.Schema.Types;

const TradeAccountInfoSchema = new Schema({
    AccountLoginId: {
        type: String,
        required: true,
        unique: true,
      },
    LastUpdatedTime:{
        type:Date,
        required:true,
    },
    MT5Balance:{
        type: SchemaTypes.Double,
        required:true
    },
    MT5Equity:{
        type: SchemaTypes.Double,
        required:true
    },
})

const TradeAccountInfo = mongoose.model("TradeAccountInfo", TradeAccountInfoSchema, "tradeAccountInfo");

module.exports = TradeAccountInfo;
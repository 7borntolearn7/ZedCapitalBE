const moment = require("moment-timezone");

function getUTCTime() {
    return moment.utc().format(); 
}

module.exports = { getUTCTime };

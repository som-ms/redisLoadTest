const dotenv = require('dotenv');
dotenv.config();
module.exports = {
  pwd: process.env.PASSWORD,
  appInsightKey: process.env.INSTRUMENTATION_KEY,
  port: process.env.PORT
};
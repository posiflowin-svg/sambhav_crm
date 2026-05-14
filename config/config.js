// config.js
require('dotenv').config(); // Add this at the top to load .env

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGO_URL || 'mongodb://localhost:27017/sales_management',
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-here',
  JWT_EXPIRES_IN: '8h'
};
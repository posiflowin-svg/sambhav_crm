// createStockManager.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const createStockManager = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL, {});
    console.log('Connected to MongoDB');

    const email = 'stockmanager@gmail.com'.trim().toLowerCase();

    // Check if stock manager already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('Stock manager user already exists');
      process.exit(0);
    }

    // Create stock manager user
    const stockManager = new User({
      name: 'Stock Manager',
      email,
      password: 'Stock@1234',
      role: 'stock_manager',
    });

    await stockManager.save();
    console.log('Stock manager user created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error creating stock manager user:', error);
    process.exit(1);
  }
};

createStockManager();

// checkUser.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const checkUser = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    const user = await User.findOne({ email: 'rahul@gmail.com' });
    console.log('User found:', user);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkUser();
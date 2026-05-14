require('dotenv').config();
const mongoose = require('mongoose');
const PincodeServiceability = require('../models/PincodeServiceability');

async function clearPincodes() {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB...');

    const result = await PincodeServiceability.deleteMany({});
    console.log(`🗑️ Deleted ${result.deletedCount} pincodes from collection.`);

  } catch (err) {
    console.error('❌ Error clearing pincodes:', err.message);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  }
}

clearPincodes();

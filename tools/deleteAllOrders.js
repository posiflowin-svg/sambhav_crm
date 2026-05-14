const mongoose = require('mongoose');
const Order = require('../models/Order');
require('dotenv').config();
// mongoose.connect(process.env.MONGO_URL, {});

async function deleteOrders() {
  try {
    const result = await Order.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} orders from the database.`);
  } catch (error) {
    console.error('❌ Error deleting orders:', error);
  } finally {
    mongoose.connection.close();
  }
}

deleteOrders();

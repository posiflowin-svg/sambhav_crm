// updatePrepaidOrdersToDelivered.js
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order'); // Adjust path as needed

const updatePrepaidOrders = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL, {});
    console.log('Connected to MongoDB');

    // Define date range: July 1, 2025 to August 15, 2025
    const startDate = new Date('2025-07-01T00:00:00.000Z');
    const endDate = new Date('2025-08-15T23:59:59.999Z');

    // Update orders
    const result = await Order.updateMany(
      {
        orderType: 'prepaid',
        updatedAt: {
          $gte: startDate,
          $lte: endDate
        },
        // Optional: Only update orders that aren't already delivered
        status: { $ne: 'delivered' },
        companyStatus: { $ne: 'delivered' }
      },
      {
        $set: {
          status: 'delivered',
          companyStatus: 'delivered',
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: 'delivered',
            changedBy: null, // or you can add an admin user ID if available
            changedAt: new Date()
          }
        }
      }
    );

    console.log(`Successfully updated ${result.modifiedCount} prepaid orders to delivered status`);
    console.log(`Date range: ${startDate.toDateString()} to ${endDate.toDateString()}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error updating orders:', error);
    process.exit(1);
  }
};

updatePrepaidOrders();
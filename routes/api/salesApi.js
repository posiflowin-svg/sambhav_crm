// routes/api/salesApi.js - Add search functionality
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const Order = require('../../models/Order');
const Customer = require('../../models/Customer');
const mongoose = require('mongoose');
router.use(authController.protect);
// router.use(authController.restrictTo('sales'));
router.get('/orders', async (req, res) => {
  try {
    const salesPersonId = req.user._id;
    const {
      status,
      orderType,
      dateFrom,
      dateTo,
      dateRange,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    // Build filter query
    let query = { salesPerson: salesPersonId };

    // Status filter
    if (status && status !== '') {
      query.status = status;
    }

    // Order type filter
    if (orderType && orderType !== '') {
      query.orderType = orderType;
    }

    // Date range filter - Use orderDate instead of createdAt
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        query.orderDate.$gte = fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        query.orderDate.$lte = toDate;
      }
    } else if (dateRange && dateRange !== '') {
      const dateFilter = getDateRangeFilter(dateRange);
      if (dateFilter) {
        query.orderDate = dateFilter;
      }
    }

    // Search functionality
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { invoiceNo: searchRegex },
        { 'customer.name': searchRegex },
        { 'products.name': searchRegex },
        { 'customer.mobileNumber': searchRegex },
        { poNumber: searchRegex }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const total = await Order.countDocuments(query);

    // Get orders with population
    const orders = await Order.find(query)
      .populate('customer', 'name mobileNumber billingAddress')
      .populate('salesPerson', 'name email')
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get statistics for current filter
    const stats = await getSalesOrderStats(salesPersonId, query);

    res.json({
      success: true,
      orders,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      limit: limitNum,
      stats
    });

  } catch (error) {
    console.error('Error fetching sales orders:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch orders',
      message: error.message 
    });
  }
});

async function getSalesOrderStats(salesPersonId, filterQuery = {}) {
  try {
    // 1. CRITICAL: Convert string ID to MongoDB ObjectId for Aggregation
    const sId = new mongoose.Types.ObjectId(salesPersonId);

    // Prepare base query
    const baseQuery = { ...filterQuery, salesPerson: sId };

    // Standard counts (These work fine as they are)
    const totalOrders = await Order.countDocuments(baseQuery);
    const pendingOrders = await Order.countDocuments({ ...baseQuery, status: 'pending' });

    // Monthly orders calculation...
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);
    const currentMonthEnd = new Date();
    currentMonthEnd.setMonth(currentMonthEnd.getMonth() + 1);
    currentMonthEnd.setDate(0);
    currentMonthEnd.setHours(23, 59, 59, 999);

    const monthlyOrders = await Order.countDocuments({
      ...baseQuery,
      orderDate: { $gte: currentMonthStart, $lte: currentMonthEnd }
    });

    // 2. FIXED AGGREGATION
    const revenueResult = await Order.aggregate([
      {
        $match: baseQuery // Now using the casted sId
      },
      {
        $group: {
          _id: null,
          // Use $toDouble to handle cases where numbers might be stored as strings
          totalRevenue: { 
            $sum: { $toDouble: { $ifNull: ['$totalAmount', 0] } } 
          },
          totalTax: { 
            $sum: { $toDouble: { $ifNull: ['$gstAmount', 0] } } 
          },
          totalApproved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          totalDispatched: { $sum: { $cond: [{ $eq: ['$status', 'dispatched'] }, 1, 0] } },
          totalDelivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } }
        }
      }
    ]);

    const result = revenueResult[0] || {};
    
    return {
      totalOrders,
      pendingOrders,
      monthlyOrders,
      totalRevenue: result.totalRevenue || 0,
      totalTax: result.totalTax || 0,
      statusCounts: {
        approved: result.totalApproved || 0,
        dispatched: result.totalDispatched || 0,
        delivered: result.totalDelivered || 0
      }
    };
  } catch (error) {
    console.error('Error getting sales order stats:', error);
    return { totalOrders: 0, pendingOrders: 0, monthlyOrders: 0, totalRevenue: 0, totalTax: 0 };
  }
}

// Dashboard statistics - Updated version
router.get('/dashboard-stats', async (req, res) => {
  try {
    const salesPersonId = req.user._id;
    
    const stats = await getSalesOrderStats(salesPersonId);

    // Get additional customer count
    const totalCustomers = await Customer.countDocuments({ 
      assignedSalesPerson: salesPersonId 
    });

    res.json({
      success: true,
      statistics: {
        ...stats,
        totalCustomers
      }
    });
    
  } catch (error) {
    console.error('Error fetching sales dashboard stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

module.exports = router;
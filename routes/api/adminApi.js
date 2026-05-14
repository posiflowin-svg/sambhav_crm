// routes/api/adminApi.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const adminController = require('../../controllers/orderController');
const Order = require('../../models/Order');
const User = require('../../models/User');
const Customer = require('../../models/Customer');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
router.use(authController.protect);

// Reports API endpoints
router.get('/reports/sales-overview', async (req, res) => {
  try {
    const { period = 'today', year = new Date().getFullYear(), startDate, endDate } = req.query;
    
    let matchStage = {};
    
    // Exclude cancelled orders
    matchStage.status = { $ne: 'cancelled' };
    
    // Date filtering based on period - FIXED LOGIC
    const now = new Date();
    
    switch (period) {
      case 'today':
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        matchStage.orderDate = { $gte: todayStart, $lte: todayEnd };
        break;
        
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
        weekEnd.setHours(23, 59, 59, 999);
        matchStage.orderDate = { $gte: weekStart, $lte: weekEnd };
        break;
        
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        matchStage.orderDate = { $gte: monthStart, $lte: monthEnd };
        break;
        
      case 'year':
        const yearStart = new Date(`${year}-01-01`);
        const yearEnd = new Date(`${year}-12-31`);
        yearEnd.setHours(23, 59, 59, 999);
        matchStage.orderDate = { $gte: yearStart, $lte: yearEnd };
        break;
        
      case 'custom':
        if (startDate && endDate) {
          const customStart = new Date(startDate);
          const customEnd = new Date(endDate);
          customEnd.setHours(23, 59, 59, 999);
          matchStage.orderDate = { $gte: customStart, $lte: customEnd };
        }
        break;
    }

    // Rest of your existing aggregation logic remains the same...
    const adminUsers = await User.find({ role: 'admin' }).select('_id');
    const adminUserIds = adminUsers.map(user => user._id);

    // User-wise sales aggregation
    const userSales = await Order.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerDetails'
        }
      },
      { $unwind: '$customerDetails' },
      {
        $group: {
          _id: '$salesPerson',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          totalTax: { $sum: '$gstAmount' },
          averageOrderValue: { $avg: '$totalAmount' },
          adminCustomerOrders: {
            $sum: {
              $cond: [
                { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
                1,
                0
              ]
            }
          },
          adminCustomerRevenue: {
            $sum: {
              $cond: [
                { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
                '$totalAmount',
                0
              ]
            }
          },
          salesPersonCustomerOrders: {
            $sum: {
              $cond: [
                { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
                0,
                1
              ]
            }
          },
          salesPersonCustomerRevenue: {
            $sum: {
              $cond: [
                { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
                0,
                '$totalAmount'
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          userId: '$_id',
          userName: '$userDetails.name',
          userEmail: '$userDetails.email',
          userRole: '$userDetails.role',
          totalOrders: 1,
          totalRevenue: 1,
          totalTax: 1,
          averageOrderValue: { $round: ['$averageOrderValue', 2] },
          adminCustomerOrders: 1,
          adminCustomerRevenue: 1,
          salesPersonCustomerOrders: 1,
          salesPersonCustomerRevenue: 1
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    // Overall statistics
    const overallStats = await Order.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerDetails'
        }
      },
      { $unwind: '$customerDetails' },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          totalTax: { $sum: '$gstAmount' },
          averageOrderValue: { $avg: '$totalAmount' },
          adminCustomerOrders: {
            $sum: {
              $cond: [
                { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
                1,
                0
              ]
            }
          },
          adminCustomerRevenue: {
            $sum: {
              $cond: [
                { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
                '$totalAmount',
                0
              ]
            }
          },
          salesPersonCustomerOrders: {
            $sum: {
              $cond: [
                { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
                0,
                1
              ]
            }
          },
          salesPersonCustomerRevenue: {
            $sum: {
              $cond: [
                { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
                0,
                '$totalAmount'
              ]
            }
          }
        }
      }
    ]);

    res.json({
      userSales,
      overallStats: overallStats[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        totalTax: 0,
        averageOrderValue: 0,
        adminCustomerOrders: 0,
        adminCustomerRevenue: 0,
        salesPersonCustomerOrders: 0,
        salesPersonCustomerRevenue: 0
      },
      period,
      year
    });

  } catch (error) {
    console.error('Error fetching sales overview:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// User-specific orders report - Updated to respect period filters
router.get('/reports/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      status, 
      orderType, 
      startDate, 
      endDate, 
      customerType,
      period = 'today',
      year = new Date().getFullYear()
    } = req.query;

    let matchStage = { 
      salesPerson: new mongoose.Types.ObjectId(userId),
      status: { $ne: 'cancelled' }
    };

    // Apply period filters (same logic as sales-overview)
    const now = new Date();
    
    switch (period) {
      case 'today':
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        matchStage.orderDate = { $gte: todayStart, $lte: todayEnd };
        break;
        
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        matchStage.orderDate = { $gte: weekStart, $lte: weekEnd };
        break;
        
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        matchStage.orderDate = { $gte: monthStart, $lte: monthEnd };
        break;
        
      case 'year':
        const yearStart = new Date(`${year}-01-01`);
        const yearEnd = new Date(`${year}-12-31`);
        yearEnd.setHours(23, 59, 59, 999);
        matchStage.orderDate = { $gte: yearStart, $lte: yearEnd };
        break;
        
      case 'custom':
        if (startDate && endDate) {
          const customStart = new Date(startDate);
          const customEnd = new Date(endDate);
          customEnd.setHours(23, 59, 59, 999);
          matchStage.orderDate = { $gte: customStart, $lte: customEnd };
        }
        break;
    }

    // Rest of your existing user orders logic...
    const user = await User.findById(userId).select('name email role');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const adminUsers = await User.find({ role: 'admin' }).select('_id');
    const adminUserIds = adminUsers.map(user => user._id);

    // Add customer type filter if specified
    if (customerType === 'admin') {
      matchStage['customerDetails.assignedSalesPerson'] = { $in: adminUserIds };
    } else if (customerType === 'sales') {
      matchStage['customerDetails.assignedSalesPerson'] = { $nin: adminUserIds };
    }

    const orders = await Order.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerDetails'
        }
      },
      { $unwind: '$customerDetails' },
      {
        $lookup: {
          from: 'users',
          localField: 'customerDetails.assignedSalesPerson',
          foreignField: '_id',
          as: 'assignedUserDetails'
        }
      },
      { $unwind: '$assignedUserDetails' },
      {
        $project: {
          orderId: '$_id',
          invoiceNo: 1,
          customerName: '$customerDetails.name',
          customerType: {
            $cond: [
              { $eq: ['$assignedUserDetails.role', 'admin'] },
              'Admin Customer',
              'Sales Person Customer'
            ]
          },
          assignedSalesPerson: '$assignedUserDetails.name',
          totalAmount: 1,
          gstAmount: 1,
          orderType: 1,
          status: 1,
          orderDate: 1,
          dueDate: 1,
          products: 1
        }
      },
      { $sort: { orderDate: -1 } },
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ]);

    // Get total count for pagination
    const totalCount = await Order.countDocuments(matchStage);

    // User stats for the filtered period
    const userStats = await Order.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerDetails'
        }
      },
      { $unwind: '$customerDetails' },
      {
        $lookup: {
          from: 'users',
          localField: 'customerDetails.assignedSalesPerson',
          foreignField: '_id',
          as: 'assignedUserDetails'
        }
      },
      { $unwind: '$assignedUserDetails' },
      {
        $group: {
            _id: null,
            lifetimeOrders: { $sum: 1 },
            lifetimeRevenue: { $sum: '$totalAmount' },
            lifetimeTax: { $sum: '$gstAmount' },
            averageOrderValue: { $avg: '$totalAmount' },
            adminCustomerOrders: {
              $sum: {
                $cond: [{ $eq: ['$assignedUserDetails.role', 'admin'] }, 1, 0]
              }
            },
            adminCustomerRevenue: {
              $sum: {
                $cond: [{ $eq: ['$assignedUserDetails.role', 'admin'] }, '$totalAmount', 0]
              }
            },
            salesPersonCustomerOrders: {
              $sum: {
                $cond: [{ $eq: ['$assignedUserDetails.role', 'admin'] }, 0, 1]
              }
            },
            salesPersonCustomerRevenue: {
              $sum: {
                $cond: [{ $eq: ['$assignedUserDetails.role', 'admin'] }, 0, '$totalAmount']
              }
            },

            // --- Corrected Repeat/New splitting (treats missing isPassiveRepeat as false) ---
            salesPersonRepeatOrders: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$assignedUserDetails.role', 'admin'] },
                      { $eq: [{ $ifNull: ['$isPassiveRepeat', false] }, true] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            salesPersonRepeatRevenue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$assignedUserDetails.role', 'admin'] },
                      { $eq: [{ $ifNull: ['$isPassiveRepeat', false] }, true] }
                    ]
                  },
                  '$totalAmount',
                  0
                ]
              }
            },
            salesPersonNewOrders: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$assignedUserDetails.role', 'admin'] },
                      { $eq: [{ $ifNull: ['$isPassiveRepeat', false] }, false] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            salesPersonNewRevenue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$assignedUserDetails.role', 'admin'] },
                      { $eq: [{ $ifNull: ['$isPassiveRepeat', false] }, false] }
                    ]
                  },
                  '$totalAmount',
                  0
                ]
              }
            }
          }
      }
    ]);

    res.json({
      user,
      orders,
      userStats: userStats[0] || {
        lifetimeOrders: 0,
        lifetimeRevenue: 0,
        lifetimeTax: 0,
        averageOrderValue: 0,
        adminCustomerOrders: 0,
        adminCustomerRevenue: 0,
        salesPersonCustomerOrders: 0,
        salesPersonCustomerRevenue: 0,
        salesPersonRepeatOrders: 0,
        salesPersonRepeatRevenue: 0,
        salesPersonNewOrders: 0,
        salesPersonNewRevenue: 0
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalOrders: totalCount,
        hasNext: (page * limit) < totalCount,
        hasPrev: page > 1
      },
      filters: {
        customerType: customerType || 'all',
        period,
        year
      }
    });

  } catch (error) {
    console.error('Error fetching user report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export reports
router.get('/reports/export', async (req, res) => {
  try {
    const { type, format = 'json', ...filters } = req.query;
    
    let data;
    if (type === 'user-wise') {
      data = await getUserWiseReport(filters);
    } else if (type === 'overall') {
      data = await getOverallReport(filters);
    }

    if (format === 'csv') {
      return exportAsCSV(res, data, 'sales-report');
    }

    res.json(data);
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Helper function for user-wise report
async function getUserWiseReport(filters) {
  const { period = 'month', year = new Date().getFullYear() } = filters;
  
  let matchStage = { status: { $ne: 'cancelled' } };
  
  // Date filtering (same as above)
  switch (period) {
    case 'today':
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      matchStage.orderDate = { $gte: today };
      break;
    case 'week':
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      matchStage.orderDate = { $gte: weekAgo };
      break;
    case 'month':
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      matchStage.orderDate = { $gte: monthAgo };
      break;
    case 'year':
      matchStage.orderDate = { 
        $gte: new Date(`${year}-01-01`),
        $lte: new Date(`${year}-12-31`)
      };
      break;
  }

  const adminUsers = await User.find({ role: 'admin' }).select('_id');
  const adminUserIds = adminUsers.map(user => user._id);

  const userSales = await Order.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'customers',
        localField: 'customer',
        foreignField: '_id',
        as: 'customerDetails'
      }
    },
    { $unwind: '$customerDetails' },
    {
      $group: {
        _id: '$salesPerson',
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$totalAmount' },
        totalTax: { $sum: '$gstAmount' },
        averageOrderValue: { $avg: '$totalAmount' },
        adminCustomerOrders: {
          $sum: {
            $cond: [
              { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
              1,
              0
            ]
          }
        },
        adminCustomerRevenue: {
          $sum: {
            $cond: [
              { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
              '$totalAmount',
              0
            ]
          }
        },
        salesPersonCustomerOrders: {
          $sum: {
            $cond: [
              { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
              0,
              1
            ]
          }
        },
        salesPersonCustomerRevenue: {
          $sum: {
            $cond: [
              { $in: ['$customerDetails.assignedSalesPerson', adminUserIds] },
              0,
              '$totalAmount'
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userDetails'
      }
    },
    {
      $unwind: {
        path: '$userDetails',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        userId: '$_id',
        userName: '$userDetails.name',
        userEmail: '$userDetails.email',
        userRole: '$userDetails.role',
        totalOrders: 1,
        totalRevenue: 1,
        totalTax: 1,
        averageOrderValue: { $round: ['$averageOrderValue', 2] },
        adminCustomerOrders: 1,
        adminCustomerRevenue: 1,
        salesPersonCustomerOrders: 1,
        salesPersonCustomerRevenue: 1
      }
    },
    { $sort: { totalRevenue: -1 } }
  ]);

  return userSales;
}

// Dashboard statistics
router.get('/dashboard-stats', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    
    const totalSalesResult = await Order.aggregate([
      { $match: { status: { $in: ['approved', 'dispatched', 'delivered'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalSales = totalSalesResult[0]?.total || 0;

    const activeUsers = await User.countDocuments({ isActive: true });

    // Recent orders
    const recentOrders = await Order.find()
      .populate('customer', 'name')
      .populate('salesPerson', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    // Chart data (simplified - you can enhance this)
    const chartData = {
      monthlyLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      monthlyOrders: [65, 59, 80, 81, 56, 55],
      statusLabels: ['Pending', 'Approved', 'Dispatched', 'Delivered'],
      statusData: [pendingOrders, 15, 8, 25] // Example data
    };

    res.json({
      totalOrders,
      pendingOrders,
      totalSales,
      activeUsers,
      recentOrders,
      chartData
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/orders', adminController.getOrdersAdmin);
router.get('/sales-persons', adminController.getSalesPersons);
router.patch('/orders/:id/status', adminController.updateOrderStatus);

router.get('/orders/export', async (req, res) => {
  try {
    const {
      status,
      orderType,
      salesPerson,
      dateFrom,
      dateTo,
      dateRange,
      amountRange,
      search
    } = req.query;

    // Build filter object (same as getOrdersAdmin)
    let filter = {};

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Order type filter
    if (orderType) {
      filter.orderType = orderType;
    }

    // Sales person filter
    if (salesPerson) {
      filter.salesPerson = salesPerson;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    } else if (dateRange) {
      const dateFilter = getDateRangeFilter(dateRange);
      if (dateFilter) {
        filter.createdAt = dateFilter;
      }
    }

    // Amount range filter
    if (amountRange) {
      filter.totalAmount = {};
      switch (amountRange) {
        case '0-1000':
          filter.totalAmount.$gte = 0;
          filter.totalAmount.$lte = 1000;
          break;
        case '1000-5000':
          filter.totalAmount.$gte = 1000;
          filter.totalAmount.$lte = 5000;
          break;
        case '5000-10000':
          filter.totalAmount.$gte = 5000;
          filter.totalAmount.$lte = 10000;
          break;
        case '10000-50000':
          filter.totalAmount.$gte = 10000;
          filter.totalAmount.$lte = 50000;
          break;
        case '50000+':
          filter.totalAmount.$gte = 50000;
          break;
      }
    }

    // Search filter
    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'salesPerson.name': { $regex: search, $options: 'i' } },
        { 'products.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Get orders with population (no pagination for export)
    const orders = await Order.find(filter)
      .populate('customer', 'name mobileNumber billingAddress')
      .populate('salesPerson', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    return await exportToExcel(res, orders, filter);

  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).json({ error: 'Failed to export orders' });
  }
});

// Toggle the isPassiveRepeat field
router.patch('/orders/:id/passive-repeat', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.isPassiveRepeat = !order.isPassiveRepeat;
    await order.save();

    res.json({
      message: 'Passive repeat status updated',
      isPassiveRepeat: order.isPassiveRepeat
    });
  } catch (error) {
    console.error('Toggle passive repeat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function for date ranges
function getDateRangeFilter(range) {
  const today = new Date();
  let startDate, endDate;

  switch (range) {
    case 'today':
      startDate = new Date(today.setHours(0, 0, 0, 0));
      endDate = new Date(today.setHours(23, 59, 59, 999));
      break;
    case 'yesterday':
      startDate = new Date(today.setDate(today.getDate() - 1));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_week':
      startDate = new Date(today.setDate(today.getDate() - today.getDay()));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last_week':
      startDate = new Date(today.setDate(today.getDate() - today.getDay() - 7));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last_month':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      return null;
  }

  return { $gte: startDate, $lte: endDate };
}

// Export to Excel function
async function exportToExcel(res, orders, filter = {}) {
  try {
    const workbook = new ExcelJS.Workbook();
    
    // Set workbook properties
    workbook.creator = 'Sales Management System';
    workbook.lastModifiedBy = 'Admin';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Create main orders worksheet
    const worksheet = workbook.addWorksheet('Orders');

    // // Add company header and report info - ROW 1
    // worksheet.mergeCells('A1:O1');
    // const titleCell = worksheet.getCell('A1');
    // titleCell.value = 'ORDERS EXPORT REPORT';
    // titleCell.font = { size: 18, bold: true, color: { argb: 'FF2D3748' } };
    // titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    // titleCell.fill = {
    //   type: 'pattern',
    //   pattern: 'solid',
    //   fgColor: { argb: 'FFE6FFFA' }
    // };

    // Generated date - ROW 2
    // worksheet.mergeCells('A2:O2');
    // const dateCell = worksheet.getCell('A2');
    // dateCell.value = `Generated on: ${new Date().toLocaleString()}`;
    // dateCell.font = { size: 10, italic: true, color: { argb: 'FF718096' } };
    // dateCell.alignment = { horizontal: 'center' };

    // Add filter information - ROW 3
    let filterInfo = 'Filters: ';
    const filterParts = [];
    if (filter.status) filterParts.push(`Status: ${filter.status}`);
    if (filter.orderType) filterParts.push(`Type: ${filter.orderType}`);
    if (filter.salesPerson) filterParts.push(`Sales Person: ${filter.salesPerson}`);
    if (filter.totalAmount) filterParts.push(`Amount Range: Applied`);
    if (filter.createdAt) filterParts.push(`Date Range: Applied`);
    
    filterInfo += filterParts.length > 0 ? filterParts.join(' | ') : 'All Orders';

    // worksheet.mergeCells('A3:O3');
    // const filterCell = worksheet.getCell('A3');
    // filterCell.value = filterInfo;
    // filterCell.font = { size: 9, italic: true, color: { argb: 'FF718096' } };
    // filterCell.alignment = { horizontal: 'center' };

    // Empty row for spacing - ROW 4
    // worksheet.addRow([]);

    // Define columns with professional styling
    worksheet.columns = [
      { header: 'ORDER ID', key: 'orderId', width: 12 },
      { header: 'INVOICE NO', key: 'invoiceNo', width: 15 },
      { header: 'CUSTOMER NAME', key: 'customerName', width: 25 },
      { header: 'MOBILE', key: 'customerMobile', width: 15 },
      { header: 'SALES PERSON', key: 'salesPerson', width: 20 },
      { header: 'ORDER DATE', key: 'orderDate', width: 12 },
      { header: 'DUE DATE', key: 'dueDate', width: 12 },
      { header: 'TYPE', key: 'orderType', width: 10 },
      { header: 'STATUS', key: 'status', width: 12 },
      { header: 'PRODUCTS', key: 'productsCount', width: 10 },
      { header: 'SUBTOTAL (₹)', key: 'subtotal', width: 15 },
      { header: 'GST (₹)', key: 'gstAmount', width: 12 },
      { header: 'TOTAL (₹)', key: 'totalAmount', width: 15 },
      { header: 'PO NUMBER', key: 'poNumber', width: 15 },
      { header: 'ADDRESS', key: 'billingAddress', width: 30 }
    ];

    // Add header row with professional styling - ROW 5
    const headerRow = worksheet.getRow(1);
    
    // Explicitly set header values
    headerRow.values = [
      'ORDER ID',
      'INVOICE NO', 
      'CUSTOMER NAME',
      'MOBILE',
      'SALES PERSON',
      'ORDER DATE',
      'DUE DATE',
      'TYPE',
      'STATUS',
      'PRODUCTS',
      'SUBTOTAL (₹)',
      'GST (₹)',
      'TOTAL (₹)',
      'PO NUMBER',
      'ADDRESS'
    ];

    // Style the header row
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2D3748' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;

    // Style all header cells with borders
    for (let i = 1; i <= 15; i++) {
      const cell = headerRow.getCell(i);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    }

    // Add data rows starting from ROW 6
    orders.forEach((order, index) => {
      const rowData = {
        orderId: order._id.toString().slice(-8).toUpperCase(),
        invoiceNo: order.invoiceNo || 'N/A',
        customerName: order.customer?.name || 'N/A',
        customerMobile: order.customer?.mobileNumber || 'N/A',
        salesPerson: order.salesPerson?.name || 'N/A',
        orderDate: new Date(order.orderDate).toLocaleDateString('en-IN'),
        dueDate: new Date(order.dueDate).toLocaleDateString('en-IN'),
        orderType: order.orderType.toUpperCase(),
        status: order.status.charAt(0).toUpperCase() + order.status.slice(1),
        productsCount: order.products?.length || 0,
        subtotal: order.subtotal || 0,
        gstAmount: order.gstAmount || 0,
        totalAmount: order.totalAmount || 0,
        poNumber: order.poNumber || 'N/A',
        billingAddress: order.customer?.billingAddress ? 
          `${order.customer.billingAddress.street}, ${order.customer.billingAddress.city}` : 'N/A'
      };

      const row = worksheet.addRow(rowData);

      // Style the data row
      row.font = { size: 10 };
      row.alignment = { vertical: 'middle' };
      row.height = 20;

      // Add borders to all cells in the row
      for (let i = 1; i <= 15; i++) {
        const cell = row.getCell(i);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      }

      // Status color coding
      const statusCell = row.getCell('I'); // Column I is STATUS
      switch (order.status) {
        case 'pending':
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
          statusCell.font = { color: { argb: 'FF92400E' }, bold: true };
          break;
        case 'approved':
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1ECF1' } };
          statusCell.font = { color: { argb: 'FF0C5460' }, bold: true };
          break;
        case 'dispatched':
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1E7FF' } };
          statusCell.font = { color: { argb: 'FF084298' }, bold: true };
          break;
        case 'delivered':
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
          statusCell.font = { color: { argb: 'FF065F46' }, bold: true };
          break;
        case 'cancelled':
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
          statusCell.font = { color: { argb: 'FF991B1B' }, bold: true };
          break;
      }

      // Format currency cells
      const subtotalCell = row.getCell('K'); // Column K is SUBTOTAL
      const gstCell = row.getCell('L'); // Column L is GST
      const totalCell = row.getCell('M'); // Column M is TOTAL

      [subtotalCell, gstCell, totalCell].forEach(cell => {
        cell.numFmt = '"₹"#,##0.00';
        cell.alignment = { horizontal: 'right' };
      });

      totalCell.font = { bold: true };

      // Center align specific columns
      const typeCell = row.getCell('H'); // Column H is TYPE
      const productsCell = row.getCell('J'); // Column J is PRODUCTS
      
      [typeCell, statusCell, productsCell].forEach(cell => {
        cell.alignment = { horizontal: 'center' };
      });
    });

    // Freeze the header row so it stays visible when scrolling
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 5, activeCell: 'A6', showGridLines: true }
    ];

    // Add summary section
    const startRow = worksheet.rowCount + 2;
    
    // Summary title
    worksheet.mergeCells(`A${startRow}:E${startRow}`);
    const summaryTitle = worksheet.getCell(`A${startRow}`);
    summaryTitle.value = 'SUMMARY REPORT';
    summaryTitle.font = { size: 12, bold: true, color: { argb: 'FF2D3748' } };
    summaryTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF7FAFC' }
    };
    summaryTitle.alignment = { horizontal: 'center' };

    // Calculate totals
    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalGST = orders.reduce((sum, order) => sum + (order.gstAmount || 0), 0);
    const totalSubtotal = orders.reduce((sum, order) => sum + (order.subtotal || 0), 0);

    const summaryData = [
      ['Total Orders:', totalOrders, ''],
      ['Total Subtotal:', '', totalSubtotal],
      ['Total GST:', '', totalGST],
      ['Total Amount:', '', totalAmount]
    ];

    summaryData.forEach(([label, count, amount], index) => {
      const rowNum = startRow + 1 + index;
      
      // Label
      worksheet.mergeCells(`A${rowNum}:C${rowNum}`);
      const labelCell = worksheet.getCell(`A${rowNum}`);
      labelCell.value = label;
      labelCell.font = { bold: true };
      labelCell.alignment = { horizontal: 'left' };
      
      // Count (if exists)
      if (count !== '') {
        const countCell = worksheet.getCell(`D${rowNum}`);
        countCell.value = count;
        countCell.font = { bold: true };
        countCell.alignment = { horizontal: 'center' };
      }
      
      // Amount (if exists)
      if (amount !== '') {
        const amountCell = worksheet.getCell(`E${rowNum}`);
        amountCell.value = amount;
        amountCell.numFmt = '"₹"#,##0.00';
        amountCell.font = { bold: true };
        amountCell.alignment = { horizontal: 'right' };
      }
    });

    // Auto-fit columns for better visibility
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 0;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(Math.max(maxLength + 2, column.width || 0), 50);
    });

    // Set response headers
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=orders_export_${timestamp}.xlsx`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Excel export error:', error);
    throw new Error('Failed to generate Excel file');
  }
}

module.exports = router;
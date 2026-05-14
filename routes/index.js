const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const authController = require('../middleware/authMiddleware');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const StockTransaction = require('../models/StockTransaction');

// POST /api/tickets
router.post('/api/tickets/', async (req, res) => {
  try {
    console.log('📥 Received ticket request:', req.body);
    const { name, phone, printerModel, issue } = req.body;

    // Basic validation
    if (!name || !phone || !printerModel || !issue) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    // Log data (for now)
    console.log('📩 New Ticket Request:');
    console.log({
      name,
      phone,
      printerModel,
      issue,
      createdAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: 'Ticket received successfully',
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// Web Routes
router.use('/', require('./web/authWeb'));
router.use('/', require('./web/adminWeb'));
router.use('/', require('./web/dashboardWeb'));
router.use('/', require('./web/customerWeb'));
router.use('/', require('./web/orderWeb'));
router.use('/', require('./web/salesWeb'));
router.use('/', require('./web/dispatcherWeb'));
router.use('/', require('./web/accountWeb'));
router.use('/', require('./web/inquiryViewRoutes'));
router.use('/products', require('./web/productWeb'));

// API Routes
router.use('/api/customers', require('./api/customerApi'));
router.use('/api/companies', require('./api/companyRoutes'));
router.use('/api/orders', require('./api/orderRoutes'));
router.use('/api/auth', require('./api/authRoutes'));
router.use('/api/users', require('./api/userApi'));
router.use('/api/admin', require('./api/adminApi'));
router.use('/api/sales', require('./api/salesApi'));
router.use('/api/file', require('./api/fileRoutes'));
router.use('/api/po', require('./api/poRoutes'));
router.use('/api/inquiries',  require('./api/inquiryRoutes'));
router.use('/api/account/orders', require('./api/orderInvoice'));

// api/dispatcher/orders
router.get('/api/dispatcher/orders', authController.protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // --- Build match conditions for aggregation ---
    const matchStage = {};

    // Status filter
    if (req.query.status) {
      matchStage.status = req.query.status;
    } else {
      matchStage.status = { $in: ['approved', 'dispatched', 'delivered'] };
    }

    // Order type filter
    if (req.query.orderType) {
      matchStage.orderType = req.query.orderType;
    }

    // Date range filters (same as before)
    if (req.query.dateRange) {
      const today = new Date();
      let startDate, endDate;
      switch (req.query.dateRange) {
        case 'today':
          startDate = new Date(today.setHours(0, 0, 0, 0));
          endDate = new Date(today.setHours(23, 59, 59, 999));
          break;
        case 'this_week':
          startDate = new Date(today.setDate(today.getDate() - today.getDay()));
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'this_month':
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
          break;
      }
      if (startDate && endDate) {
        matchStage.orderDate = { $gte: startDate, $lte: endDate };
      }
    }

    if (req.query.dateFrom || req.query.dateTo) {
      matchStage.orderDate = {};
      if (req.query.dateFrom) matchStage.orderDate.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) {
        const toDate = new Date(req.query.dateTo);
        toDate.setHours(23, 59, 59, 999);
        matchStage.orderDate.$lte = toDate;
      }
    }

    // --- Aggregation Pipeline ---
    const pipeline = [];

    // 1. Join Customer collection
    pipeline.push({
      $lookup: {
        from: 'customers',          // collection name (usually lowercase plural)
        localField: 'customer',
        foreignField: '_id',
        as: 'customerData'
      }
    });

    // 2. Unwind (since each order has one customer)
    pipeline.push({ $unwind: { path: '$customerData', preserveNullAndEmptyArrays: false } });

    // 3. Join User collection for salesPerson (optional)
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'salesPerson',
        foreignField: '_id',
        as: 'salesPersonData'
      }
    });
    pipeline.push({ $unwind: { path: '$salesPersonData', preserveNullAndEmptyArrays: true } });

    // 4. Apply search filter on joined data
    if (req.query.search) {
      const searchRegex = { $regex: req.query.search, $options: 'i' };
      const searchConditions = [
        { 'customerData.name': searchRegex },        // ✅ Search by customer name
        { invoiceNo: searchRegex },
        { orderReference: searchRegex },
        { trackingId: searchRegex }
      ];
      // Merge with existing matchStage conditions
      if (matchStage.$or) {
        // Combine with AND logic
        matchStage.$and = [{ $or: searchConditions }, { $or: matchStage.$or }];
        delete matchStage.$or;
      } else {
        matchStage.$or = searchConditions;
      }
    }

    // 5. Apply the main filters
    if (Object.keys(matchStage).length) {
      pipeline.push({ $match: matchStage });
    }

    // 6. Sort
    pipeline.push({ $sort: { orderDate: -1, createdAt: -1 } });

    // 7. Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // 8. Project to match expected output structure
    pipeline.push({
      $project: {
        _id: 1,
        invoiceNo: 1,
        orderReference: 1,
        trackingId: 1,
        orderType: 1,
        status: 1,
        orderDate: 1,
        dueDate: 1,
        totalAmount: 1,
        total: 1,
        createdAt: 1,
        updatedAt: 1,
        // Flatten customer data for frontend compatibility
        customer: {
          _id: '$customerData._id',
          name: '$customerData.name',
          mobileNumber: '$customerData.mobileNumber',
          address: '$customerData.billingAddress'  // or shippingAddress as needed
        },
        salesPerson: {
          _id: '$salesPersonData._id',
          name: '$salesPersonData.name'
        },
        // Include other fields as required
        products: 1,
        subtotal: 1,
        gstAmount: 1
      }
    });

    // Execute aggregation
    const orders = await Order.aggregate(pipeline);

    // --- Count total documents (using the same filters but without pagination) ---
    const countPipeline = [...pipeline];
    // Remove skip/limit and add $count
    const skipIndex = countPipeline.findIndex(stage => stage.$skip !== undefined);
    const limitIndex = countPipeline.findIndex(stage => stage.$limit !== undefined);
    if (skipIndex > -1) countPipeline.splice(skipIndex, 1);
    if (limitIndex > -1) countPipeline.splice(limitIndex - (skipIndex > -1 ? 1 : 0), 1);
    countPipeline.push({ $count: 'total' });

    const countResult = await Order.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // --- Stats (unchanged, they don't need customer name filter) ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const stats = {
      totalOrders: await Order.countDocuments({ status: { $in: ['approved', 'dispatched', 'delivered'] } }),
      pendingOrders: await Order.countDocuments({ status: 'approved' }),
      dispatchedOrders: await Order.countDocuments({ status: 'dispatched' }),
      deliveredOrders: await Order.countDocuments({
        status: 'delivered',
        deliveredDate: { $gte: todayStart, $lte: todayEnd }
      })
    };

    res.json({
      orders,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats
    });
  } catch (error) {
    console.error('Error fetching dispatcher orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Add export route for dispatcher
router.get('/api/dispatcher/orders/export', authController.protect, async (req, res) => {
  try {
    // Build the same filter as the main orders route
    let filter = {};
    
    if (req.query.status) {
      filter.status = req.query.status;
    } else {
      filter.status = { $in: ['approved', 'dispatched', 'delivered'] };
    }
    
    if (req.query.orderType) {
      filter.orderType = req.query.orderType;
    }
    
    if (req.query.search) {
      const searchRegex = { $regex: req.query.search, $options: 'i' };
      filter.$or = [
        { 'customer.name': searchRegex },
        { invoiceNo: searchRegex },
        { orderReference: searchRegex },
        { customerName: searchRegex }
      ];
    }

    // Date range filter (same logic as main route)
    if (req.query.dateRange) {
      const today = new Date();
      let startDate, endDate;

      switch(req.query.dateRange) {
        case 'today':
          startDate = new Date(today.setHours(0, 0, 0, 0));
          endDate = new Date(today.setHours(23, 59, 59, 999));
          break;
        case 'this_week':
          startDate = new Date(today.setDate(today.getDate() - today.getDay()));
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'this_month':
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          break;
      }

      if (startDate && endDate) {
        filter.orderDate = { $gte: startDate, $lte: endDate };
      }
    }

    // Custom date range
    if (req.query.dateFrom || req.query.dateTo) {
      filter.orderDate = {};
      if (req.query.dateFrom) {
        filter.orderDate.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        const toDate = new Date(req.query.dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.orderDate.$lte = toDate;
      }
    }

    const orders = await Order.find(filter)
      .populate('customer', 'name mobileNumber address')
      .populate('salesPerson', 'name')
      .sort({ orderDate: -1 })
      .lean();

    // Set response headers for Excel file
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=dispatcher_orders_${new Date().toISOString().split('T')[0]}.xlsx`
    );

    // Create workbook
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dispatcher Orders');
    
    // Add headers
    worksheet.columns = [
      { header: 'Order ID', key: 'orderId', width: 15 },
      { header: 'Invoice No', key: 'invoiceNo', width: 15 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Contact', key: 'customerContact', width: 15 },
      { header: 'Order Type', key: 'orderType', width: 12 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Total Amount', key: 'totalAmount', width: 15 },
      { header: 'Order Date', key: 'orderDate', width: 12 },
      { header: 'Due Date', key: 'dueDate', width: 12 },
      { header: 'Tracking ID', key: 'trackingId', width: 20 },
      { header: 'Sales Person', key: 'salesPerson', width: 20 }
    ];

    // Format headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    orders.forEach(order => {
      worksheet.addRow({
        orderId: order.orderReference || order._id.toString().slice(-6).toUpperCase(),
        invoiceNo: order.invoiceNo || 'N/A',
        customerName: order.customer?.name || order.customerName || 'N/A',
        customerContact: order.customer?.mobileNumber || order.customerContact || 'N/A',
        orderType: order.orderType?.toUpperCase() || 'N/A',
        status: order.status?.charAt(0).toUpperCase() + order.status?.slice(1) || 'N/A',
        totalAmount: order.total || order.totalAmount || 0,
        orderDate: order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-IN') : 'N/A',
        dueDate: order.dueDate ? new Date(order.dueDate).toLocaleDateString('en-IN') : 'N/A',
        trackingId: order.trackingId || 'N/A',
        salesPerson: order.salesPerson?.name || 'N/A'
      });
    });

    // Format numeric columns
    worksheet.getColumn('totalAmount').numFmt = '#,##0.00';

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export orders' });
  }
});

// Update order status (for dispatcher actions) - Keep your existing implementation
router.patch('/api/dispatcher/orders/:id/status', authController.protect, async (req, res) => {
  try {
    const { status, trackingId } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Validate status transition
    const validTransitions = {
      'approved': ['dispatched'],
      'dispatched': ['delivered']
    };

    // if (!validTransitions[order.status]?.includes(status)) {
    //   return res.status(400).json({ error: 'Invalid status transition' });
    // }

    // Validate tracking ID for dispatch
    if (status === 'dispatched' && !trackingId) {
      return res.status(400).json({ error: 'Tracking ID is required for dispatch' });
    }

    order.status = status;
    
    // Set dispatched date and tracking ID when marking as dispatched
    // if (status === 'dispatched') {
      order.trackingId = trackingId;
      order.dispatchedDate = new Date();
    // }
    
    // Set delivered date when marking as delivered
    if (status === 'delivered') {
      order.deliveredDate = new Date();
    }

    await order.save();

    res.json({ 
      message: 'Order status updated successfully', 
      order 
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Send order back for update with reason (with stock reversal)
router.patch('/api/dispatcher/orders/:id/send-back', authController.protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { reason } = req.body;
    const orderId = req.params.id;

    // Fetch order within session
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user has permission (dispatcher or admin)
    if (!['dispatcher', 'admin', 'stock_manager'].includes(req.user.role)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ error: 'Only dispatchers and admins can send orders back for update' });
    }

    // Validate that order can be sent back
    const allowedStatuses = ['approved', 'dispatched', 'delivered'];
    if (!allowedStatuses.includes(order.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        error: 'Only approved, dispatched, or delivered orders can be sent back for update' 
      });
    }

    // Store the previous status
    const previousStatus = order.status;

    // ========== STOCK REVERSAL (if products have references) ==========
    const hasProducts = order.products && order.products.length > 0 && order.products[0].product;

    if (hasProducts) {
      // For each product, add stock back (stock in)
      for (const item of order.products) {
        const product = await Product.findById(item.product).session(session);
        if (!product) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ error: `Product with id ${item.product} not found` });
        }

        const previousStock = product.stockQuantity;
        const newStock = previousStock + item.quantity; // add back

        // Update product stock
        product.stockQuantity = newStock;
        product.lastUpdated = Date.now();
        await product.save({ session });

        // Create stock transaction
        await StockTransaction.create([{
          type: 'stock_in',
          item: product._id,
          itemCode: product.itemCode,
          itemName: product.itemName,
          category: product.category,
          location: product.location,
          quantity: item.quantity, // positive
          unit: product.unit,
          previousStock,
          newStock,
          reference: 'order_send_back',
          referenceId: order._id,
          description: `Stock in due to order sent back from ${previousStatus} to pending. Invoice #${order.invoiceNo}. Reason: ${reason || 'Not provided'}`,
          performedBy: req.user._id,
          transactionDate: new Date()
        }], { session });
      }
    }

    // Update order status to pending
    order.status = 'pending';
    order.updatedAt = new Date();

    // Add detailed notes
    if (!order.notes) {
      order.notes = [];
    }

    const noteMessage = reason 
      ? `Order sent back for update from ${previousStatus} status. Reason: ${reason}`
      : `Order sent back for update from ${previousStatus} status`;

    order.notes.push({
      type: 'status_change',
      message: noteMessage,
      changedBy: req.user._id,
      changedAt: new Date(),
      details: {
        previousStatus,
        reason: reason || 'No reason provided'
      }
    });

    await order.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Populate for response (outside transaction)
    await order.populate('customer', 'name mobileNumber');
    await order.populate('salesPerson', 'name email');
    // Optionally populate product details if needed
    if (order.populate) {
      await order.populate('products.product', 'itemCode itemName');
    }

    res.json({ 
      message: 'Order has been sent back for update successfully', 
      order,
      previousStatus
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error sending order back for update:', error);
    res.status(500).json({ error: 'Failed to send order back for update' });
  }
});

module.exports = router;

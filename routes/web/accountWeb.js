// routes/web/accountWeb.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const Order = require('../../models/Order');

// Account Dashboard Page
router.get('/account/orders', authController.protect, (req, res) => {
  try {
    res.render('account/orders', {
      title: 'Account Dashboard - Order Management',
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading account orders page:', error);
    res.status(500).render('error', { error: 'Failed to load orders page' });
  }
});

// API endpoint for fetching orders
router.get('/api/account/orders', authController.protect, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 15, 
      search, 
      status, 
      orderType, 
      billFilter,
      dateFrom, 
      dateTo 
    } = req.query;
    
    // Build filter
    let filter = {};
    
    // Status filter (dispatched, delivered, cancelled only)
    if (status) {
      filter.status = { $in: status.split(',') };
    } else {
      filter.status = { $in: ['dispatched', 'delivered', 'cancelled'] };
    }
    
    // Order type filter
    if (orderType) filter.orderType = orderType;
    
    // Bill punch filter
    if (billFilter === 'punched') {
      filter.billPunch = true;
    } else if (billFilter === 'pending') {
      filter.billPunch = false;
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        filter.orderDate.$gte = fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.orderDate.$lte = toDate;
      }
    }
    
    // Search filter
    if (search) {
      filter.$or = [
        { invoiceNo: new RegExp(search, 'i') },
        { 'customer.name': new RegExp(search, 'i') },
        { customerName: new RegExp(search, 'i') },
        { trackingId: new RegExp(search, 'i') },
        { orderReference: new RegExp(search, 'i') }
      ];
    }

    // Get total count
    const total = await Order.countDocuments(filter);
    
    // Get orders with pagination
    const orders = await Order.find(filter)
      .populate('customer', 'name mobileNumber address')
      .sort({ orderDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));


    // Get statistics BASED ON THE SAME FILTER (excluding pagination)
    const statsFilter = { ...filter }; // Copy the filter
    
    // Get counts for each status using the same filter
    const [
      dispatchedOrders,
      deliveredOrders,
      cancelledOrders,
      billPendingOrders
    ] = await Promise.all([
      Order.countDocuments({ ...statsFilter, status: 'dispatched' }),
      Order.countDocuments({ ...statsFilter, status: 'delivered' }),
      Order.countDocuments({ ...statsFilter, status: 'cancelled' }),
      Order.countDocuments({ 
        ...statsFilter, 
        status: { $in: ['dispatched', 'delivered'] },
        billPunch: false 
      })
    ]);

    // Also get total orders count for the filter
    const totalOrders = await Order.countDocuments(statsFilter);

    const stats = {
      totalOrders,
      dispatchedOrders,
      deliveredOrders,
      cancelledOrders,
      billPendingOrders
    };

    res.json({
      orders,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      stats
    });
  } catch (error) {
    console.error('Error fetching account orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update bill punch status
router.patch('/api/account/orders/:id/billpunch', authController.protect, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { billPunch: req.body.billPunch },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({ success: true, order });
  } catch (error) {
    console.error('Error updating bill punch:', error);
    res.status(500).json({ error: 'Failed to update bill punch' });
  }
});

// Export orders
router.get('/api/account/orders/export', authController.protect, async (req, res) => {
  try {
    const { status, orderType, billFilter, search, dateFrom, dateTo } = req.query;
    
    // Build filter (same as above)
    let filter = {};
    filter.status = { $in: (status || 'dispatched,delivered,cancelled').split(',') };
    if (orderType) filter.orderType = orderType;
    
    if (billFilter === 'punched') {
      filter.billPunch = true;
    } else if (billFilter === 'pending') {
      filter.billPunch = false;
    }
    
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        filter.orderDate.$gte = fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.orderDate.$lte = toDate;
      }
    }
    
    if (search) {
      filter.$or = [
        { invoiceNo: new RegExp(search, 'i') },
        { 'customer.name': new RegExp(search, 'i') },
        { trackingId: new RegExp(search, 'i') }
      ];
    }

    const orders = await Order.find(filter)
      .populate('customer', 'name mobileNumber address')
      .sort({ orderDate: -1 });

    // Generate CSV
    const csv = generateOrderCSV(orders);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=orders-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
    
  } catch (error) {
    console.error('Error exporting orders:', error);
    res.status(500).json({ error: 'Failed to export orders' });
  }
});

function generateOrderCSV(orders) {
  const headers = ['Order ID', 'Customer', 'Contact', 'City', 'Amount', 'Type', 'Status', 'Order Date', 'Bill Punch', 'Tracking ID'];
  
  const rows = orders.map(order => [
    order.invoiceNo || order._id.toString().slice(-6),
    order.customer?.name || order.customerName || 'N/A',
    order.customer?.mobileNumber || order.customerContact || 'N/A',
    order.customer?.address?.city || order.shippingAddress?.city || '',
    order.total || order.totalAmount || 0,
    order.orderType || '',
    order.status || '',
    new Date(order.orderDate || order.createdAt).toLocaleDateString('en-IN'),
    order.billPunch ? 'Yes' : 'No',
    order.trackingId || ''
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

// Account Order View Page
router.get('/account/orders/:id', authController.protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name mobileNumber billingAddress shippingAddress')
      .populate('salesPerson', 'name');

    if (!order) {
      return res.status(404).render('error', { error: 'Order not found' });
    }

    res.render('account/view-order', {
      title: `Order #${order.invoiceNo} - Account`,
      user: req.user,
      order,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading account order view:', error);
    res.status(500).render('error', { error: 'Failed to load order details' });
  }
});

// Update bill punch status with timestamp
router.patch('/api/account/orders/:id/billpunch', authController.protect, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { 
        billPunch: req.body.billPunch,
        billPunchedAt: req.body.billPunchedAt || new Date()
      },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({ success: true, order });
  } catch (error) {
    console.error('Error updating bill punch:', error);
    res.status(500).json({ error: 'Failed to update bill punch' });
  }
});

module.exports = router;
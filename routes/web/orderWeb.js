// routes/web/orderWeb.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const Order = require('../../models/Order');
const Customer = require('../../models/Customer');

router.use(authController.protect);

// Order List Page
router.get('/orders', async (req, res) => {
  try {
    let orders;
    let query = {};
    
    if (req.user.role === 'sales') {
      query.salesPerson = req.user._id;
    } else if (req.user.role === 'dispatcher') {
      query.status = { $in: ['pending', 'approved'] };
    }
    
    orders = await Order.find(query)
      .populate('customer', 'name mobileNumber')
      .populate('salesPerson', 'name')
      .sort({ createdAt: -1 });

    res.render('orders/list', {
      user: req.user,
      orders,
      title: 'Orders'
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Create Order Page (Sales only)
router.get('/orders/add', async (req, res) => {
  try {
    const customers = await Customer.find({ assignedSalesPerson: req.user._id });
    
    res.render('orders/add', {
      user: req.user,
      customers,
      title: 'Create Order'
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Order Details Page
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer')
      .populate('salesPerson', 'name')
      .populate('approvedBy', 'name');

    if (!order) {
      return res.status(404).render('error', { message: 'Order not found' });
    }

    // Check access permissions
    if (req.user.role === 'sales' && order.salesPerson._id.toString() !== req.user._id.toString()) {
      return res.status(403).render('error', { message: 'Access denied' });
    }

    res.render('orders/details', {
      user: req.user,
      order,
      title: 'Order Details'
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Dispatcher Order Approval Page
router.get('/dispatcher/orders/:id/approve', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer')
      .populate('salesPerson', 'name');

    if (!order) {
      return res.status(404).render('error', { message: 'Order not found' });
    }

    res.render('orders/approve', {
      user: req.user,
      order,
      title: 'Approve Order'
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

module.exports = router;
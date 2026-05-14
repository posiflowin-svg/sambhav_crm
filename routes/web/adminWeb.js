// routes/web/adminWeb.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const User = require('../../models/User');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');

// Admin Dashboard
// router.get('/admin/dashboard', authController.protect, (req, res) => {
//   res.render('admin/dashboard', {
//     user: req.user,
//     title: 'Admin Dashboard',
//     activeTab: 'dashboard'
//   });
// });

// Admin Users Page
router.get('/admin/users', authController.protect, async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { role: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(query).select('-password').sort({ createdAt: -1 });

    res.render('admin/users', {
      user: req.user,
      users,
      searchQuery: search || '',
      title: 'Manage Users',
      activeTab: 'users'
    });
  } catch (error) {
    console.error('Error loading users page:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Admin Orders Page
router.get('/admin/orders', authController.protect, (req, res) => {
  try {
    res.render('admin/orders', {
      title: 'Orders Management - Admin',
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading admin orders page:', error);
    res.status(500).render('error', { error: 'Failed to load orders page' });
  }
});

// Admin View Order Details - THIS MUST COME BEFORE THE :id ROUTE
router.get('/admin/orders/:id', authController.protect, async (req, res) => {
  try {
    // Validate if the ID is a valid MongoDB ObjectId
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      req.flash('error_msg', 'Invalid order ID');
      return res.redirect('/admin/orders');
    }

    const order = await Order.findById(req.params.id)
      .populate('customer')
      .populate('salesPerson', 'name email')
      .populate('approvedBy', 'name email');

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/admin/orders');
    }

    res.render('admin/view-order', {
      title: `Order #${order.invoiceNo} - Admin`,
      order,
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading order:', error);
    req.flash('error_msg', 'Failed to load order');
    res.redirect('/admin/orders');
  }
});

// Admin Reports Page
router.get('/admin/reports', authController.protect, (req, res) => {
  res.render('admin/reports', {
    user: req.user,
    title: 'Sales Reports',
    activeTab: 'reports'
  });
});

module.exports = router;
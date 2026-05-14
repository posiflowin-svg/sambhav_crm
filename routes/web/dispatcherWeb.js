// routes/web/dispatcherWeb.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const Order = require('../../models/Order');

// Dispatcher Orders Page
router.get('/dispatcher/orders', authController.protect, (req, res) => {
  try {
    res.render('dispatcher/orders', {
      title: 'Orders Management - Dispatcher',
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading dispatcher orders page:', error);
    res.status(500).render('error', { error: 'Failed to load orders page' });
  }
});

// Dispatcher Order View Page
router.get('/dispatcher/orders/:id', authController.protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name mobileNumber billingAddress')
      .populate('salesPerson', 'name');

    if (!order) {
      return res.status(404).render('error', { error: 'Order not found' });
    }

    res.render('dispatcher/view-order', {
      title: `Order #${order.invoiceNo} - Dispatcher`,
      user: req.user,
      order,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading dispatcher order view:', error);
    res.status(500).render('error', { error: 'Failed to load order details' });
  }
});

module.exports = router;
// routes/api/orderApi.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const Order = require('../../models/Order');

router.use(authController.protect);

// Create Order (Sales only)
router.post('/', async (req, res) => {
  try {
    const orderData = {
      ...req.body,
      salesPerson: req.user._id
    };

    const order = await Order.create(orderData);
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get Orders
router.get('/', async (req, res) => {
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

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve Order (Dispatcher only)
router.put('/:id/approve', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        status: 'approved',
        approvedBy: req.user._id,
        approvedAt: new Date(),
        ...req.body
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error approving order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update Tracking (Dispatcher only)
router.put('/:id/tracking', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        trackingId: req.body.trackingId,
        status: 'dispatched',
        dispatchedAt: new Date()
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error updating tracking:', error);
    res.status(400).json({ message: error.message });
  }
});

// Mark as Delivered (Sales only)
router.put('/:id/deliver', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if sales person owns this order
    if (order.salesPerson.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    order.status = 'delivered';
    order.deliveredAt = new Date();
    await order.save();

    res.json(order);
  } catch (error) {
    console.error('Error marking as delivered:', error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
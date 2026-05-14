// routes/web/salesWeb.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const orderController = require('../../controllers/orderController');
const inquiryController = require('../../controllers/inquiryController');
const companyViewController = require('../../controllers/companyController');
// router.use(authController.protect);

// Sales Dashboard
router.get('/sales/dashboard',authController.protect, (req, res) => {
  res.render('sales/dashboard', {
    user: req.user,
    title: 'Sales Dashboard',
    activeTab: 'dashboard'
  });
});


router.get('/sales/orders', authController.protect, async (req, res) => {
  try {
    res.render('sales/orders', {
      title: 'Orders Management',
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading orders page:', error);
    res.status(500).render('error', { error: 'Failed to load orders page' });
  }
});

// Create Order Page for Sales with customer pre-selection
router.get('/sales/orders/create', authController.protect, async (req, res) => {
  try {
    let customerData = null;
    
    // If customerId is provided in query, fetch customer details
    if (req.query.customerId) {
      const customer = await Customer.findById(req.query.customerId);
      if (customer) {
        customerData = {
          id: customer._id,
          name: customer.name,
          mobileNumber: customer.mobileNumber,
          billingAddress: customer.billingAddress,
          shippingAddress: customer.shippingAddress
        };
      }
    }

    res.render('sales/create-order', {
      user: req.user,
      title: 'Create Order',
      activeTab: 'orders',
      customerData: customerData
    });
  } catch (error) {
    console.error('Error loading create order page:', error);
    res.render('sales/create-order', {
      user: req.user,
      title: 'Create Order',
      activeTab: 'orders',
      customerData: null
    });
  }
});

router.post('/sales/orders', authController.protect, orderController.createOrder);

// Add these routes to your web API
router.get('/sales/orders/:id/edit', authController.protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer')
      .populate('salesPerson', 'name email');

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/sales/orders');
    }

    // Check if the order belongs to the current sales person
    if (order.salesPerson._id.toString() !== req.user._id.toString()) {
      req.flash('error_msg', 'You can only edit your own orders');
      return res.redirect('/sales/orders');
    }

    res.render('sales/edit-order', {
      title: `Edit Order #${order.invoiceNo}`,
      order,
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading order for edit:', error);
    req.flash('error_msg', 'Failed to load order for editing');
    res.redirect('/sales/orders');
  }
});

router.put('/sales/orders/:id', authController.protect, orderController.editOrder);

router.get('/sales/orders/:id', authController.protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer')
      .populate('salesPerson', 'name email')
      .populate('approvedBy', 'name email');

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/sales/orders');
    }

    res.render('sales/view-order', {
      title: `Order #${order.invoiceNo}`,
      order,
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error loading order:', error);
    req.flash('error_msg', 'Failed to load order');
    res.redirect('/sales/orders');
  }
});

// Sales Customers List - Show ALL customers
router.get('/sales/customers',authController.protect, async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    // Sales users can see ALL customers (not just assigned ones)
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobileNumber: { $regex: search, $options: 'i' } },
          { gstin: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const customers = await Customer.find(query)
      .populate('assignedSalesPerson', 'name email')
      .sort({ createdAt: -1 });

    res.render('sales/customers', {
      user: req.user,
      customers,
      searchQuery: search || '',
      title: 'Customers',
      activeTab: 'customers'
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Create Customer Page for Sales
router.get('/sales/customers/create',authController.protect, (req, res) => {
  res.render('sales/create-customer', {
    user: req.user,
    title: 'Add Customer',
    activeTab: 'customers'
  });
});

// Edit Customer Page for Sales
router.get('/sales/customers/edit/:id',authController.protect, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('assignedSalesPerson', 'name email');
    
    if (!customer) {
      return res.status(404).render('error', { message: 'Customer not found' });
    }

    res.render('sales/edit-customer', {
      user: req.user,
      customer,
      title: 'Edit Customer'
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

router.get('/sales/companies', (req, res) => {
  res.render('sales/companies', { user: req.user });
});

router.get('/sales/companies/:companyId', companyViewController.getCompanyInfo);

module.exports = router;
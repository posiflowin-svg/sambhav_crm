// routes/web/customerWeb.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const Customer = require('../../models/Customer');

router.use(authController.protect);

// Customer List Page
router.get('/customers', async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    let customers;

    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobileNumber: { $regex: search, $options: 'i' } },
          { gstin: { $regex: search, $options: 'i' } }
        ]
      };
    }
    customers = await Customer.find(query).populate('assignedSalesPerson', 'name email');


    res.render('customers/list', {
      user: req.user,
      customers,
      searchQuery: search || '',
      title: 'Customers'
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});
// Add Customer Page
router.get('/customers/add', (req, res) => {
  res.render('customers/add', {
    user: req.user,
    title: 'Add Customer'
  });
});

// Edit Customer Page
router.get('/customers/edit/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).render('error', { message: 'Customer not found' });
    }

    res.render('customers/edit', {
      user: req.user,
      customer,
      title: 'Edit Customer'
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

module.exports = router;
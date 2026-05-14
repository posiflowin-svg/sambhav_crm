// routes/api/customerApi.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');
const Customer = require('../../models/Customer');

router.use(authController.protect);

// Create Customer
router.post('/', async (req, res) => {
  try {
    const customerData = {
      ...req.body,
      assignedSalesPerson: req.user.role === 'sales' ? req.user._id : req.body.assignedSalesPerson
    };

    const customer = await Customer.create(customerData);
    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get Customers
router.get('/', async (req, res) => {
  try {
    const customers = await Customer.find()
      .populate('assignedSalesPerson', 'name email')
      .sort({ createdAt: -1 });

    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Customer
router.put('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // // Check if sales person can update this customer
    // if (req.user.role === 'sales' && customer.assignedSalesPerson.toString() !== req.user._id.toString()) {
    //   return res.status(403).json({ message: 'Access denied' });
    // }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Check if sales person can delete this customer
    if (req.user.role === 'sales' && customer.assignedSalesPerson.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
module.exports = router;
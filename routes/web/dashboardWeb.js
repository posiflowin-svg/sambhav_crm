// routes/web/dashboardWeb.js
const express = require('express');
const router = express.Router();
const authController = require('../../middleware/authMiddleware');

// Protect all dashboard routes
router.use(authController.protect);

// Admin Dashboard
router.get('/admin/dashboard', (req, res) => {
  res.render('admin/dashboard', {
    user: req.user,
    title: 'Admin Dashboard'
  });
});

// Sales Dashboard
router.get('/sales/dashboard', (req, res) => {
  res.render('sales/dashboard', {
    user: req.user,
    title: 'Sales Dashboard'
  });
});

// Dispatcher Dashboard
router.get('/dispatcher/dashboard', (req, res) => {
  res.render('dispatcher/dashboard', {
    user: req.user,
    title: 'Dispatcher Dashboard'
  });
});

// Common Dashboard (fallback)
router.get('/dashboard', (req, res) => {
  const dashboardPaths = {
    admin: '/admin/dashboard',
    sales: '/sales/dashboard',
    dispatcher: '/dispatcher/dashboard'
  };
  
  res.redirect(dashboardPaths[req.user.role] || '/admin/dashboard');
});

module.exports = router;
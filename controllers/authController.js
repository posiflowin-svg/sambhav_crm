// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const bcrypt = require('bcryptjs');

// controllers/authController.js - Update the login method
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      if (req.accepts('html')) {
        req.flash('error_msg', 'Email and password are required');
        return res.redirect('/auth/login');
      }
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }
    });

    if (!user || !user.isActive) {
      const message = !user ? 'Invalid email or password' : 'Account is inactive. Please contact support.';
      if (req.accepts('html')) {
        req.flash('error_msg', message);
        return res.redirect('/auth/login');
      }
      return res.status(401).json({ message });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      if (req.accepts('html')) {
        req.flash('error_msg', 'Invalid email or password');
        return res.redirect('/auth/login');
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Handle HTML Form Login
    if (req.accepts('html')) {
      req.session.user = user;
      req.session.token = token;

      res.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000 // 8 hours
      });

      // Updated dashboard paths for 3 roles
      const dashboardPaths = {
        admin: '/admin/reports',
        sales: '/sales/orders',
        stock_manager: '/products',
        dispatcher: '/dispatcher/dashboard',
        account: '/account/orders',
        inquiry: '/inquiries'
      };
      
      return res.redirect(dashboardPaths[user.role] || '/dashboard');
    }

    // Fallback: API JSON response
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    if (req.accepts('html')) {
      req.flash('error_msg', 'Server error during login');
      return res.redirect('/auth/login');
    }
    res.status(500).json({ message: 'Server error during login' });
  }
};
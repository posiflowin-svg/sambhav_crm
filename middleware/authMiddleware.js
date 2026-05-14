const User = require('../models/User');
const jwt = require('jsonwebtoken');

const checkAccountantRole = (type) => {
  return (req, res, next) => {
    if (req.user.role === `${type}_accountant`) {
      return next();
    }
    req.flash('error_msg', 'Unauthorized access');
    res.redirect('/dashboard');
  };
};

const checkDispatchRole = (type) => {
  return (req, res, next) => {
    if (req.user.role === `${type}_dispatch`) {
      return next();
    }
    req.flash('error_msg', 'Unauthorized access');
    res.redirect('/dashboard');
  };
};

const protect = async (req, res, next) => {
  if (req.session?.user) {
    req.user = req.session.user;
    return next();
  }

  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) throw new Error('User not found');

      req.user = user; // ✅ fixed: now you get `_id` directly
      return next();
    } catch (err) {
      console.error('JWT verification failed:', err.message);
    }
  }

  if (req.accepts('html')) {
    req.flash('error_msg', 'Please log in to access this page');
    return res.redirect('/auth/login');
  }

  res.status(401).json({ message: 'Not authorized' });
};

module.exports = {
  protect,
  checkAccountantRole,
  checkDispatchRole
};
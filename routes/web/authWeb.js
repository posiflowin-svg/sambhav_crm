const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');

// Login Page
router.get('/auth/login', (req, res) => {
  res.render('auth/login');
});

// Login Handler
router.post('/auth/login', authController.login);

// Logout
router.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('jwt');
    res.redirect('/auth/login');
  });
});

module.exports = router;

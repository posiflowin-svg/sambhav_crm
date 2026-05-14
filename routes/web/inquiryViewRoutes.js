const express = require('express');
const router = express.Router();
const inquiryViewController = require('../../controllers/inquiryViewController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

// GET /inquiries - Dashboard
router.get('/inquiries', inquiryViewController.renderDashboard);

// GET /inquiries/create - Create form
router.get('/inquiries/create', inquiryViewController.renderCreateForm);

// GET /inquiries/:inquiryId/edit - Edit form
router.get('/inquiries/:inquiryId/edit', inquiryViewController.renderEditForm);

// GET /inquiries/:inquiryId - View details
router.get('/inquiries/:inquiryId', inquiryViewController.renderDetails);

module.exports = router;
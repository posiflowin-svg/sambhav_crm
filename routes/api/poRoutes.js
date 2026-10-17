const express = require('express');
const router = express.Router();
const poController = require('../../controllers/poController');
const { protect } = require('../../middleware/authMiddleware');

// All PO handlers rely on req.user. Without authentication, reversal fails
// and the browser may receive an HTML login/error page instead of JSON.
router.use(protect);

// Render page
router.get('/', poController.renderPOManagement);

// API Routes
router.get('/api/pos', poController.getPOs);
router.get('/api/products', poController.getProducts);
router.get('/api/pos/:id', poController.getPO);
router.post('/api/pos', poController.createPO);
router.put('/api/pos/:id', poController.updatePO);
router.post('/api/pos/:id/reverse', poController.reversePO);
router.post('/api/pos/:id/receive', poController.receiveItems);
router.post('/api/product-and-po', poController.createProductAndPO);

// Add this line with your other routes
router.get('/api/export/excel', poController.exportPOsToExcel);

module.exports = router;
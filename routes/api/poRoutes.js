const express = require('express');
const router = express.Router();
const poController = require('../../controllers/poController');

// Render page
router.get('/', poController.renderPOManagement);

// API Routes
router.get('/api/pos', poController.getPOs);
router.get('/api/products', poController.getProducts);
router.get('/api/pos/:id', poController.getPO);
router.post('/api/pos', poController.createPO);
router.put('/api/pos/:id', poController.updatePO);
router.post('/api/pos/:id/receive', poController.receiveItems);
router.post('/api/product-and-po', poController.createProductAndPO);

// Add this line with your other routes
router.get('/api/export/excel', poController.exportPOsToExcel);

module.exports = router;
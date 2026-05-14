// routes/api/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/orderController');
const upload = require('../../middleware/upload');
const authController = require('../../middleware/authMiddleware');
// Apply protection to all routes
// router.use(authController.protect);

// Order routes
router.post('/', authController.protect, orderController.createOrder);
router.get('/', authController.protect, orderController.getOrders);
router.get('/:id', authController.protect, orderController.getOrder);
router.put('/:id', authController.protect, orderController.updateOrder);
router.delete('/:id', authController.protect, orderController.deleteOrder);
router.patch('/:id/status', authController.protect, orderController.updateOrderStatus);
// PI Document upload route
router.post(
  '/:orderId/pi-document',
  upload.single('piDocument'),
  orderController.uploadPIDocument
);

module.exports = router;
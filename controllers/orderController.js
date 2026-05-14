// controllers/orderController.js
const Order = require('../models/Order');
const FileService = require('../utils/fileService');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const StockTransaction = require('../models/StockTransaction');

// Helper function for date ranges (make it standalone)
function getDateRangeFilter(range) {
  const today = new Date();
  let startDate, endDate;

  switch (range) {
    case 'today':
      startDate = new Date(today.setHours(0, 0, 0, 0));
      endDate = new Date(today.setHours(23, 59, 59, 999));
      break;
    case 'yesterday':
      startDate = new Date(today.setDate(today.getDate() - 1));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_week':
      startDate = new Date(today.setDate(today.getDate() - today.getDay()));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last_week':
      startDate = new Date(today.setDate(today.getDate() - today.getDay() - 7));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last_month':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      return null;
  }

  return { $gte: startDate, $lte: endDate };
}

// Get admin order statistics (make it standalone)
async function getAdminOrderStats() {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const approvedOrders = await Order.countDocuments({ status: 'approved' });
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });

    return {
      totalOrders,
      pendingOrders,
      approvedOrders,
      deliveredOrders
    };
  } catch (error) {
    console.error('Error getting admin order stats:', error);
    return {
      totalOrders: 0,
      pendingOrders: 0,
      approvedOrders: 0,
      deliveredOrders: 0
    };
  }
}
function getDateRangeFilter(range) {
  const today = new Date();
  let startDate, endDate;

  switch (range) {
    case 'today':
      startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_week':
      startDate = new Date(today);
      startDate.setDate(today.getDate() - today.getDay());
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last_week':
      startDate = new Date(today);
      startDate.setDate(today.getDate() - today.getDay() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last_month':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      return null;
  }

  return { $gte: startDate, $lte: endDate };
}

class OrderController {
  // controllers/orderController.js
  async createOrder(req, res) {
    try {
      // Get user from session
      if (req.session?.user) {
        req.user = req.session.user;
      }

      const {
        customer,
        products,
        orderDate,
        dueDate,
        invoiceNo,
        poNumber,
        poDate,
        orderType,
        creditAmount,
        includeGst
      } = req.body;

      // Validate required fields
      if (!customer || !products || !dueDate || !invoiceNo || !orderType) {
        return res.status(400).json({
          error: 'Missing required fields: customer, products, dueDate, invoiceNo, orderType'
        });
      }

      // Parse products (already an array if sent as JSON)
      let productsArray;
      try {
        productsArray = typeof products === 'string' ? JSON.parse(products) : products;
      } catch (error) {
        return res.status(400).json({ error: 'Invalid products format' });
      }

      if (!Array.isArray(productsArray) || productsArray.length === 0) {
        return res.status(400).json({ error: 'Products array is required and cannot be empty' });
      }

      // ========== NEW: Validate stock availability ==========
      for (const item of productsArray) {
        // Ensure each item has a productId
        if (!item.productId) {
          return res.status(400).json({ error: 'Each product must include a productId' });
        }

        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({ error: `Product with id ${item.productId} not found` });
        }
        if (product.stockQuantity < item.quantity) {
          return res.status(400).json({
            error: `Insufficient stock for product "${product.itemName}". Available: ${product.stockQuantity}, requested: ${item.quantity}`
          });
        }

        // Optionally attach the product name if not provided (but frontend sends it)
        if (!item.name) item.name = product.itemName;
      }

      // ========== Amount calculations (unchanged) ==========
      const subtotal = productsArray.reduce((sum, product) => sum + (parseFloat(product.total) || 0), 0);

      let gstAmount = 0, cgst = 0, sgst = 0, totalAmount = 0;
      if (includeGst) {
        gstAmount = subtotal * 0.18;
        cgst = gstAmount / 2;
        sgst = gstAmount / 2;
        totalAmount = subtotal + gstAmount;
      } else {
        totalAmount = subtotal;
      }
      const roundOff = Math.round(totalAmount) - totalAmount;
      totalAmount = Math.round(totalAmount);

      // Credit order validation
      if (orderType === 'credit' && (!creditAmount || parseFloat(creditAmount) <= 0)) {
        return res.status(400).json({ error: 'Credit amount is required for credit orders' });
      }

      // Prepare products for saving (rename productId → product)
      const orderProducts = productsArray.map(p => ({
        product: p.productId,   // store reference
        name: p.name,
        quantity: p.quantity,
        rate: p.rate,
        total: p.total
      }));

      // Create order
      const order = new Order({
        customer,
        salesPerson: req.user.id || req.user._id,
        products: orderProducts,
        orderDate: orderDate || new Date(),
        dueDate,
        invoiceNo,
        poNumber: poNumber || undefined,
        poDate: poDate || undefined,
        orderType,
        creditAmount: orderType === 'credit' ? parseFloat(creditAmount) : 0,
        subtotal,
        gstAmount,
        cgst,
        sgst,
        roundOff,
        totalAmount,
        status: 'pending',
        includeGst: Boolean(includeGst)
      });

      await order.save();

      // Populate references for response
      await order.populate('customer', 'name mobileNumber billingAddress');
      await order.populate('salesPerson', 'name email');
      await order.populate('products.product', 'itemCode itemName stockQuantity'); // optional

      res.status(201).json({
        message: 'Order created successfully',
        order
      });

    } catch (error) {
      console.error('Create order error:', error);
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ error: 'Validation failed', details: errors });
      }
      res.status(500).json({
        error: 'Failed to create order',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  // Get all orders with filtering and pagination
  async getOrders(req, res) {

    try {
      const {
        page = 1,
        limit = 10,
        status,
        orderType,
        customer,
        startDate,
        endDate
      } = req.query;

      const filter = {};
      
      if (status) filter.status = status;
      if (orderType) filter.orderType = orderType;
      if (customer) filter.customer = customer;
      
      // Date range filter
      if (startDate || endDate) {
        filter.orderDate = {};
        if (startDate) filter.orderDate.$gte = new Date(startDate);
        if (endDate) filter.orderDate.$lte = new Date(endDate);
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 },
        populate: [
          { path: 'customer', select: 'name mobileNumber' },
          { path: 'salesPerson', select: 'name email' }
        ]
      };

      const orders = await Order.paginate(filter, options);

      res.json({
        orders: orders.docs,
        totalPages: orders.totalPages,
        currentPage: orders.page,
        totalOrders: orders.totalDocs
      });
    } catch (error) {
      console.error('Get orders error:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }

  // Get single order
  async getOrder(req, res) {

    try {
      const order = await Order.findById(req.params.id)
        .populate('customer')
        .populate('salesPerson', 'name email')
        .populate('approvedBy', 'name email');

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(order);
    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }

  // Update order
  async updateOrder(req, res) {

    try {
      const {
        products,
        dueDate,
        poNumber,
        poDate,
        orderType,
        creditAmount
      } = req.body;

      const order = await Order.findById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // // Check if order can be modified (only pending orders can be modified by sales)
      // if (order.status !== 'pending' && req.user.role === 'sales') {
      //   return res.status(400).json({ 
      //     error: 'Only pending orders can be modified' 
      //   });
      // }

      // Update fields
      if (products) {
        let productsArray;
        try {
          productsArray = typeof products === 'string' ? JSON.parse(products) : products;
        } catch (error) {
          return res.status(400).json({ error: 'Invalid products format' });
        }

        order.products = productsArray;
        
        // Recalculate amounts
        const subtotal = productsArray.reduce((sum, product) => sum + (product.total || 0), 0);
        const gstAmount = subtotal * 0.18;
        const cgst = gstAmount / 2;
        const sgst = gstAmount / 2;
        const totalWithGst = subtotal + gstAmount;
        const roundOff = Math.round(totalWithGst) - totalWithGst;
        const totalAmount = Math.round(totalWithGst);

        order.subtotal = subtotal;
        order.gstAmount = gstAmount;
        order.cgst = cgst;
        order.sgst = sgst;
        order.roundOff = roundOff;
        order.totalAmount = totalAmount;
      }

      if (dueDate) order.dueDate = dueDate;
      if (poNumber) order.poNumber = poNumber;
      if (poDate) order.poDate = poDate;
      if (orderType) order.orderType = orderType;
      if (creditAmount !== undefined) order.creditAmount = creditAmount;

      await order.save();
      await order.populate('customer', 'name mobileNumber billingAddress');

      res.json({
        message: 'Order updated successfully',
        order
      });
    } catch (error) {
      console.error('Update order error:', error);
      res.status(500).json({ 
        error: 'Failed to update order',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // edit order
  async editOrder(req, res) {
    try {
      const orderId = req.params.id;

      const {
        products,
        orderDate,
        dueDate,
        invoiceNo,
        poNumber,
        poDate,
        orderType,
        creditAmount,
        includeGst
      } = req.body;

      // =============================
      // 1️⃣ Find Order
      // =============================
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // =============================
      // 2️⃣ Ownership Check
      // =============================
      if (order.salesPerson.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'You can only update your own orders' });
      }

      // =============================
      // 3️⃣ Status Check
      // =============================
      if (order.status !== 'pending') {
        return res.status(400).json({
          error: 'Only pending orders can be edited'
        });
      }

      // =============================
      // 4️⃣ Parse Products
      // =============================
      let productsArray;
      try {
        productsArray = typeof products === 'string'
          ? JSON.parse(products)
          : products;
      } catch (err) {
        return res.status(400).json({ error: 'Invalid products format' });
      }

      if (!Array.isArray(productsArray) || productsArray.length === 0) {
        return res.status(400).json({
          error: 'Products array is required and cannot be empty'
        });
      }

      // =============================
      // 5️⃣ Validate Stock & Map productId → product
      // =============================
      const orderProducts = [];

      for (const item of productsArray) {

        if (!item.productId) {
          return res.status(400).json({
            error: 'Each product must include productId'
          });
        }

        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({
            error: `Product not found with id ${item.productId}`
          });
        }

        if (product.stockQuantity < item.quantity) {
          return res.status(400).json({
            error: `Insufficient stock for "${product.itemName}". Available: ${product.stockQuantity}, requested: ${item.quantity}`
          });
        }

        orderProducts.push({
          product: item.productId,   // ✅ FIXED
          name: item.name || product.itemName,
          quantity: item.quantity,
          rate: item.rate,
          total: item.total
        });
      }

      // =============================
      // 6️⃣ Amount Calculations
      // =============================
      const subtotal = orderProducts.reduce((sum, p) => {
        return sum + (parseFloat(p.total) || 0);
      }, 0);

      let gstAmount = 0;
      let cgst = 0;
      let sgst = 0;
      let totalAmount = 0;

      if (includeGst) {
        gstAmount = subtotal * 0.18;
        cgst = gstAmount / 2;
        sgst = gstAmount / 2;
        totalAmount = subtotal + gstAmount;
      } else {
        totalAmount = subtotal;
      }

      const roundOff = Math.round(totalAmount) - totalAmount;
      totalAmount = Math.round(totalAmount);

      // =============================
      // 7️⃣ Credit Validation
      // =============================
      if (orderType === 'credit' && (!creditAmount || parseFloat(creditAmount) <= 0)) {
        return res.status(400).json({
          error: 'Credit amount is required for credit orders'
        });
      }

      // =============================
      // 8️⃣ Update Order Fields
      // =============================
      order.products = orderProducts;
      order.orderDate = orderDate || order.orderDate;
      order.dueDate = dueDate;
      order.invoiceNo = invoiceNo;
      order.poNumber = poNumber || undefined;
      order.poDate = poDate || undefined;
      order.orderType = orderType;
      order.creditAmount =
        orderType === 'credit' ? parseFloat(creditAmount) : 0;

      order.subtotal = subtotal;
      order.gstAmount = gstAmount;
      order.cgst = cgst;
      order.sgst = sgst;
      order.roundOff = roundOff;
      order.totalAmount = totalAmount;
      order.includeGst = Boolean(includeGst);

      await order.save();

      // =============================
      // 9️⃣ Populate
      // =============================
      await order.populate('customer', 'name mobileNumber billingAddress');
      await order.populate('salesPerson', 'name email');
      await order.populate('products.product', 'itemCode itemName stockQuantity');

      return res.json({
        message: 'Order updated successfully',
        order
      });

    } catch (error) {
      console.error('Update order error:', error);

      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
      }

      return res.status(500).json({
        error: 'Failed to update order',
        details: process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
      });
    }
  }

  // Delete order
  async deleteOrder(req, res) {
    try {
      const order = await Order.findById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Check if order can be deleted (only pending orders can be deleted)
      if (order.status !== 'pending') {
        return res.status(400).json({ 
          error: 'Only pending orders can be deleted' 
        });
      }

      // Delete associated PI document
      if (order.piDocument && order.piDocument.original) {
        await FileService.deleteFile('piDocuments', order.piDocument.original);
      }

      await Order.findByIdAndDelete(req.params.id);

      res.json({ message: 'Order deleted successfully' });
    } catch (error) {
      console.error('Delete order error:', error);
      res.status(500).json({ error: 'Failed to delete order' });
    }
  }

  // Upload PI document for existing order
  async uploadPIDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const order = await Order.findById(req.params.orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Delete existing PI document if it exists
      if (order.piDocument && order.piDocument.original) {
        await FileService.deleteFile('piDocuments', order.piDocument.original);
      }

      // Upload new PI document
      const uploadResult = await FileService.uploadFile(
        'piDocuments',
        req.file.buffer,
        req.file.originalname,
        {
          orderId: order._id,
          contentType: req.file.mimetype,
          documentType: 'pi'
        }
      );

      order.piDocument = {
        original: uploadResult.filename,
        updated: null
      };

      await order.save();

      res.json({
        message: 'PI document uploaded successfully',
        file: {
          filename: uploadResult.filename,
          url: `/api/files/${uploadResult.filename}?bucket=piDocuments`
        }
      });
    } catch (error) {
      console.error('PI document upload error:', error);
      res.status(500).json({ error: 'Failed to upload PI document' });
    }
  }

  async updateOrderStatus(req, res) {
    let session;
    let committed = false;
    let updatedOrder;

    try {
      session = await mongoose.startSession();
      session.startTransaction();

      const { status } = req.body;
      const orderId = req.params.id;

      // Fetch order within session
      const order = await Order.findById(orderId).session(session);
      if (!order) {
        await session.abortTransaction();
        await session.endSession();
        return res.status(404).json({ error: 'Order not found' });
      }

      // Validate status transition
      const validTransitions = {
        'pending': ['approved', 'cancelled'],
        'approved': ['dispatched', 'cancelled'],
        'dispatched': ['delivered'],
        'delivered': [],
        'cancelled': []
      };

      if (!validTransitions[order.status].includes(status)) {
        await session.abortTransaction();
        await session.endSession();
        return res.status(400).json({ 
          error: `Cannot change status from ${order.status} to ${status}` 
        });
      }

      // Prepare update data
      const updateData = { status };
      switch (status) {
        case 'approved':
          updateData.approvedAt = new Date();
          updateData.approvedBy = req.user.id;
          break;
        case 'dispatched':
          updateData.dispatchedAt = new Date();
          break;
        case 'delivered':
          updateData.deliveredAt = new Date();
          break;
        case 'cancelled':
          updateData.cancelledAt = new Date();
          break;
      }

      // Stock operations (only if order has product references)
      const hasProducts = order.products && order.products.length > 0 && order.products[0].product;

      if (hasProducts) {
        const userId = req.user._id;

        if (status === 'approved') {
          // Stock out for each product
          for (const item of order.products) {
            const product = await Product.findById(item.product).session(session);
            if (!product) {
              await session.abortTransaction();
              await session.endSession();
              return res.status(404).json({ error: `Product ${item.product} not found` });
            }

            const previousStock = product.stockQuantity;
            const newStock = previousStock - item.quantity;
            
            if (newStock < 0) {
              await session.abortTransaction();
              await session.endSession();
              return res.status(400).json({ 
                error: `Insufficient stock for product ${product.itemName}. Available: ${previousStock}, required: ${item.quantity}`
              });
            }

            product.stockQuantity = newStock;
            product.lastUpdated = Date.now();
            await product.save({ session });

            await StockTransaction.create([{
              type: 'stock_out',
              item: product._id,
              itemCode: product.itemCode,
              itemName: product.itemName,
              category: product.category,
              location: product.location,
              quantity: -item.quantity,
              unit: product.unit,
              previousStock,
              newStock,
              reference: 'order_approval',
              referenceId: order._id,
              description: `Stock out on order approval for invoice #${order.invoiceNo}`,
              performedBy: userId,
              transactionDate: new Date()
            }], { session });
          }
        } else if (status === 'cancelled') {
          // Stock in for each product
          // for (const item of order.products) {
          //   const product = await Product.findById(item.product).session(session);
          //   if (!product) {
          //     await session.abortTransaction();
          //     await session.endSession();
          //     return res.status(404).json({ error: `Product ${item.product} not found` });
          //   }

          //   const previousStock = product.stockQuantity;
          //   const newStock = previousStock + item.quantity;

          //   product.stockQuantity = newStock;
          //   product.lastUpdated = Date.now();
          //   await product.save({ session });

          //   await StockTransaction.create([{
          //     type: 'stock_in',
          //     item: product._id,
          //     itemCode: product.itemCode,
          //     itemName: product.itemName,
          //     category: product.category,
          //     location: product.location,
          //     quantity: item.quantity,
          //     unit: product.unit,
          //     previousStock,
          //     newStock,
          //     reference: 'order_cancellation',
          //     referenceId: order._id,
          //     description: `Stock in on order cancellation for invoice #${order.invoiceNo}`,
          //     performedBy: userId,
          //     transactionDate: new Date()
          //   }], { session });
          // }
        }
      }

      // Update order status (within transaction)
      updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true, session }
      );

      // Commit transaction and clean up session
      await session.commitTransaction();
      committed = true;
      await session.endSession();
      session = null;

      // Now populate and respond (outside transaction)
      if (updatedOrder) {
        await updatedOrder.populate('customer');
        await updatedOrder.populate('salesPerson', 'name email');
        await updatedOrder.populate('approvedBy', 'name email');
        await updatedOrder.populate('products.product', 'itemCode itemName');
      }

      res.json({
        message: `Order status updated to ${status}`,
        order: updatedOrder
      });

    } catch (error) {
      console.error('Update order status error:', error);

      // If a session exists and we haven't committed, abort and end it
      if (session) {
        if (!committed) {
          try {
            await session.abortTransaction();
          } catch (abortError) {
            console.error('Error aborting transaction:', abortError);
          }
        }
        try {
          await session.endSession();
        } catch (endError) {
          console.error('Error ending session:', endError);
        }
      }

      res.status(500).json({ error: 'Failed to update order status' });
    }
  }

  async getOrdersAdmin(req, res) {
    try {
      const {
        status,
        orderType,
        salesPerson,
        dateFrom,
        dateTo,
        dateRange,
        amountRange,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 15
      } = req.query;

      // Build filter object (admin can see all orders)
      let filter = {};

      // Status filter
      if (status && status !== '') {
        filter.status = status;
      }

      // Order type filter
      if (orderType && orderType !== '') {
        filter.orderType = orderType;
      }

      // Sales person filter
      if (salesPerson && salesPerson !== '') {
        // Validate if it's a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(salesPerson)) {
          filter.salesPerson = new mongoose.Types.ObjectId(salesPerson);
        }
      }

      // Date range filter - FIXED: Use orderDate instead of createdAt
      if (dateFrom || dateTo) {
        filter.orderDate = {};
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          filter.orderDate.$gte = fromDate;
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          filter.orderDate.$lte = toDate;
        }
      } else if (dateRange && dateRange !== '') {
        const dateFilter = getDateRangeFilter(dateRange);
        if (dateFilter) {
          filter.orderDate = dateFilter;
        }
      }

      // Amount range filter
      if (amountRange && amountRange !== '') {
        filter.totalAmount = {};
        switch (amountRange) {
          case '0-1000':
            filter.totalAmount.$gte = 0;
            filter.totalAmount.$lte = 1000;
            break;
          case '1000-5000':
            filter.totalAmount.$gte = 1000;
            filter.totalAmount.$lte = 5000;
            break;
          case '5000-10000':
            filter.totalAmount.$gte = 5000;
            filter.totalAmount.$lte = 10000;
            break;
          case '10000-50000':
            filter.totalAmount.$gte = 10000;
            filter.totalAmount.$lte = 50000;
            break;
          case '50000+':
            filter.totalAmount.$gte = 50000;
            break;
        }
      }

      // Search filter - FIXED: Better search logic
      if (search && search.trim() !== '') {
        const searchRegex = new RegExp(search.trim(), 'i');
        filter.$or = [
          { invoiceNo: searchRegex },
          { 'customer.name': searchRegex },
          { 'salesPerson.name': searchRegex },
          { 'products.name': searchRegex },
          { 'customer.mobileNumber': searchRegex },
          { poNumber: searchRegex }
        ];
      }

      // Calculate pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // console.log('Filter criteria:', JSON.stringify(filter, null, 2));

      // Get total count for pagination
      const total = await Order.countDocuments(filter);

      // Build query for orders
      let ordersQuery = Order.find(filter)
        .populate('customer', 'name mobileNumber billingAddress')
        .populate('salesPerson', 'name email')
        .populate('approvedBy', 'name email')
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limitNum);

      // Execute query
      const orders = await ordersQuery.lean();

      // Get stats - Now calling the standalone function
      const stats = await getAdminOrderStats();

      // Also get filtered stats for the current filter criteria
      const filteredStats = {
        totalOrders: total,
        pendingOrders: await Order.countDocuments({ ...filter, status: 'pending' }),
        approvedOrders: await Order.countDocuments({ ...filter, status: 'approved' }),
        deliveredOrders: await Order.countDocuments({ ...filter, status: 'delivered' })
      };

      res.json({
        success: true,
        orders,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
        stats: filteredStats, // Use filtered stats for display
        overallStats: stats // Include overall stats if needed
      });

    } catch (error) {
      console.error('Get admin orders error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch orders',
        message: error.message 
      });
    }
  }

  // Get sales persons for filter - IMPROVED VERSION
  async getSalesPersons(req, res) {
    try {
      const salesPersons = await User.find({ 
        $or: [
          { role: 'sales' },
          { role: 'admin' } // Include admins who might also create orders
        ],
        isActive: true 
      })
      .select('_id name email role')
      .sort({ name: 1 })
      .lean();

      // Add a count of orders for each sales person
      const salesPersonsWithCounts = await Promise.all(
        salesPersons.map(async (person) => {
          const orderCount = await Order.countDocuments({ 
            salesPerson: person._id 
          });
          return {
            ...person,
            orderCount
          };
        })
      );

      res.json({
        success: true,
        salesPersons: salesPersonsWithCounts
      });

    } catch (error) {
      console.error('Get sales persons error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch sales persons',
        message: error.message 
      });
    }
  }
}

module.exports = new OrderController();
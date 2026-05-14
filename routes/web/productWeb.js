const express = require('express');
const router = express.Router();
const Product = require('../../models/Product');
const StockTransaction = require('../../models/StockTransaction');
const ProductOrder = require('../../models/ProductOrder');

// ==================== WEB PAGES ====================

// Products List Page
router.get('/', async (req, res) => {  // Changed from '/products'
  try {
    res.render('products/index', {
      user: req.user || {},
      title: 'Product Management'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Add Product Page
router.get('/add', async (req, res) => {  // Changed from '/products/add'
  try {
    res.render('products/add', {
      user: req.user || {},
      title: 'Add New Product'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Edit Product Page
router.get('/edit/:id', async (req, res) => {  // Changed from '/products/edit/:id'
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).render('error', { message: 'Product not found' });
    }

    res.render('products/edit', {
      user: req.user || {},
      product,
      title: 'Edit Product'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// View Product Details Page
router.get('/view/:id', async (req, res) => {  // Changed from '/products/view/:id'
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).render('error', { message: 'Product not found' });
    }

    // Get recent transactions
    const recentTransactions = await StockTransaction.find({ item: product._id })
      .populate('performedBy', 'name email')
      .sort({ transactionDate: -1 })
      .limit(10);

    res.render('products/view', {
      user: req.user || {},
      product,
      recentTransactions,
      title: product.itemName
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Stock Transactions Page
router.get('/transactions', async (req, res) => {  // Changed from '/products/transactions'
  try {
    res.render('products/transactions', {
      user: req.user || {},
      title: 'Stock Transactions'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Stock Adjustment Page
router.get('/stock-adjustment/:id', async (req, res) => {  // Changed from '/products/stock-adjustment/:id'
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).render('error', { message: 'Product not found' });
    }

    res.render('products/stock-adjustment', {
      user: req.user || {},
      product,
      title: 'Adjust Stock - ' + product.itemCode
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// ==================== API ENDPOINTS ====================

// Get all products (API) - Updated with latest price
router.get('/api/products', async (req, res) => {
  try {
    const { 
      search, 
      category, 
      location, 
      page = 1, 
      limit = 100,
      sortBy = 'itemCode',
      sortOrder = 'asc',
      lowStockOnly = false
    } = req.query;
    
    const query = { isActive: true };
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    if (category) query.category = category;
    if (location) query.location = location;
    
    if (search) {
      query.$or = [
        { itemCode: { $regex: search, $options: 'i' } },
        { itemName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (lowStockOnly === 'true') {
      query.$expr = { 
        $and: [
          { $gt: ['$minimumStock', 0] },
          { $lte: ['$stockQuantity', '$minimumStock'] }
        ]
      };
    }

    const products = await Product.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    // Get latest price for each product from purchase orders
    const productIds = products.map(p => p._id);
    
    const latestPrices = await ProductOrder.aggregate([
      { $unwind: '$items' },
      { 
        $match: { 
          'items.product': { $in: productIds },
          'items.pricePerUnit': { $exists: true, $ne: null }
        } 
      },
      {
        $sort: { orderDate: -1 }
      },
      {
        $group: {
          _id: '$items.product',
          latestPrice: { $first: '$items.pricePerUnit' },
          latestOrderDate: { $first: '$orderDate' },
          averagePrice: { $avg: '$items.pricePerUnit' }
        }
      }
    ]);

    // Create a map for quick lookup
    const priceMap = {};
    latestPrices.forEach(price => {
      priceMap[price._id] = {
        latestPrice: price.latestPrice,
        latestOrderDate: price.latestOrderDate,
        averagePrice: price.averagePrice
      };
    });

    // Get total stock value
    const totalStock = await Product.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$stockQuantity' } } }
    ]);

    // Enrich products with price information
    const enrichedProducts = products.map(product => {
      const productObj = product.toObject();
      const priceInfo = priceMap[product._id];
      
      if (priceInfo) {
        productObj.latestPrice = priceInfo.latestPrice;
        productObj.averagePrice = priceInfo.averagePrice;
        productObj.latestOrderDate = priceInfo.latestOrderDate;
      } else {
        productObj.latestPrice = null;
        productObj.averagePrice = null;
        productObj.latestOrderDate = null;
      }
      
      // Calculate stock value
      productObj.stockValue = productObj.latestPrice ? productObj.stockQuantity * productObj.latestPrice : 0;
      
      return productObj;
    });

    // Calculate total inventory value
    const totalInventoryValue = enrichedProducts.reduce((sum, p) => sum + p.stockValue, 0);

    res.json({
      success: true,
      data: enrichedProducts,
      stats: {
        totalStock: totalStock[0]?.total || 0,
        totalProducts: total,
        totalInventoryValue: totalInventoryValue
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single product (API)
router.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create product (API)
router.post('/api/products', async (req, res) => {
  try {
    // Check if item code already exists
    const existingProduct = await Product.findOne({ itemCode: req.body.itemCode });
    if (existingProduct) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product with this item code already exists' 
      });
    }

    const product = new Product(req.body);
    await product.save();
    
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update product (API)
router.put('/api/products/:id', async (req, res) => {
  try {
    // Don't allow updating itemCode
    if (req.body.itemCode) {
      delete req.body.itemCode;
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete product (soft delete) (API)
router.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Product deactivated successfully',
      data: product 
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stock operations (API)
router.post('/api/products/:id/stock', async (req, res) => {
  try {
    const { quantity, type, description, reference } = req.body;
    
    // In production, use actual user ID from auth
    const userId = req.user?._id || 'system';

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Validate transaction type
    const validTypes = ['stock_in', 'stock_out', 'adjustment', 'damage'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }

    // Calculate quantity based on type
    let adjustedQuantity = parseFloat(quantity);
    if (type === 'stock_out' || type === 'damage') {
      adjustedQuantity = -Math.abs(adjustedQuantity);
    }

    // Update stock
    const previousStock = product.stockQuantity;
    const newStock = previousStock + adjustedQuantity;
    
    // Validate stock doesn't go negative
    if (newStock < 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient stock. Available: ${previousStock}, Requested: ${Math.abs(adjustedQuantity)}` 
      });
    }

    // Update product stock
    product.stockQuantity = newStock;
    product.lastUpdated = Date.now();
    await product.save();

    // Create stock transaction
    const transaction = await StockTransaction.create({
      type,
      item: product._id,
      itemCode: product.itemCode,
      itemName: product.itemName,
      category: product.category,
      location: product.location,
      quantity: adjustedQuantity,
      unit: product.unit,
      previousStock,
      newStock,
      reference,
      description,
      performedBy: userId
    });

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: product,
      transaction
    });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get stock transactions for a product (API)
router.get('/api/products/:id/transactions', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      type, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    const query = { item: req.params.id };
    
    if (type) query.type = type;
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) query.transactionDate.$gte = new Date(startDate);
      if (endDate) query.transactionDate.$lte = new Date(endDate);
    }
    
    const transactions = await StockTransaction.find(query)
      .populate('performedBy', 'name email')
      .sort({ transactionDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await StockTransaction.countDocuments(query);
    
    // Get transaction summary
    const summary = await StockTransaction.aggregate([
      { $match: query },
      { 
        $group: {
          _id: '$type',
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: transactions,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all stock transactions (API)
router.get('/api/transactions', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      type, 
      itemCode, 
      category, 
      page = 1, 
      limit = 50 
    } = req.query;
    
    const query = {};
    
    if (type) query.type = type;
    if (itemCode) query.itemCode = { $regex: itemCode, $options: 'i' };
    if (category) query.category = category;
    
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) query.transactionDate.$gte = new Date(startDate);
      if (endDate) query.transactionDate.$lte = new Date(endDate);
    }
    
    const transactions = await StockTransaction.find(query)
      .populate('performedBy', 'name email')
      .populate('item', 'itemCode itemName')
      .sort({ transactionDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await StockTransaction.countDocuments(query);
    
    // Get summary
    const summary = await StockTransaction.aggregate([
      { $match: query },
      { 
        $group: {
          _id: '$type',
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: transactions,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get low stock products (API)
router.get('/api/alerts/low-stock', async (req, res) => {  // Changed path
  try {
    const products = await Product.find({
      isActive: true,
      minimumStock: { $gt: 0 },
      $expr: { $lte: ['$stockQuantity', '$minimumStock'] }
    }).sort({ stockQuantity: 1 });

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get product statistics (API)
router.get('/api/dashboard/stats', async (req, res) => {  // Changed path
  try {
    const totalProducts = await Product.countDocuments({ isActive: true });
    
    const totalStockValue = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: '$stockQuantity' } } }
    ]);
    
    const categories = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    
    const lowStockCount = await Product.countDocuments({
      isActive: true,
      minimumStock: { $gt: 0 },
      $expr: { $lte: ['$stockQuantity', '$minimumStock'] }
    });

    // Get stock movement summary (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentTransactions = await StockTransaction.aggregate([
      {
        $match: {
          transactionDate: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$type',
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalProducts,
        totalStock: totalStockValue[0]?.total || 0,
        categories,
        lowStockCount,
        recentTransactions
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bulk stock update (API)
router.post('/api/products/bulk/stock', async (req, res) => {
  try {
    const { operations } = req.body;
    
    // In production, use actual user ID from auth
    const userId = req.user?._id || 'system';
    
    const results = [];
    const errors = [];
    
    for (const operation of operations) {
      try {
        const product = await Product.findById(operation.productId);
        if (!product) {
          errors.push({ productId: operation.productId, error: 'Product not found' });
          continue;
        }
        
        let adjustedQuantity = operation.quantity;
        if (operation.type === 'stock_out' || operation.type === 'damage') {
          adjustedQuantity = -Math.abs(operation.quantity);
        }
        
        const previousStock = product.stockQuantity;
        const newStock = previousStock + adjustedQuantity;
        
        if (newStock < 0) {
          errors.push({
            productId: operation.productId,
            error: `Insufficient stock. Available: ${previousStock}`
          });
          continue;
        }
        
        // Update product stock
        product.stockQuantity = newStock;
        product.lastUpdated = Date.now();
        await product.save();
        
        // Create transaction
        await StockTransaction.create({
          type: operation.type,
          item: product._id,
          itemCode: product.itemCode,
          itemName: product.itemName,
          category: product.category,
          location: product.location,
          quantity: adjustedQuantity,
          unit: product.unit,
          previousStock,
          newStock,
          reference: operation.reference,
          description: operation.description,
          performedBy: userId
        });
        
        results.push({
          productId: operation.productId,
          itemCode: product.itemCode,
          success: true
        });
      } catch (error) {
        errors.push({
          productId: operation.productId,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Bulk operation completed',
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulk stock update:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Export products to CSV (API)
router.get('/api/export/products', async (req, res) => {  // Changed path
  try {
    const products = await Product.find({ isActive: true })
      .sort({ itemCode: 1 })
      .select('itemCode itemName description category location stockQuantity unit minimumStock maximumStock');
    
    // Create CSV content
    const csvHeader = [
      'Item Code',
      'Item Name',
      'Description',
      'Category',
      'Location',
      'Stock Quantity',
      'Unit',
      'Minimum Stock',
      'Maximum Stock',
      'Status'
    ].join(',');
    
    const csvRows = products.map(product => [
      `"${product.itemCode}"`,
      `"${product.itemName}"`,
      `"${product.description || ''}"`,
      `"${product.category}"`,
      `"${product.location}"`,
      product.stockQuantity,
      `"${product.unit}"`,
      product.minimumStock || '',
      product.maximumStock || '',
      product.stockQuantity <= product.minimumStock ? 'Low Stock' : 'Normal'
    ].join(','));
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=products_export.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export transactions to CSV (API)
router.get('/api/export/transactions', async (req, res) => {  // Changed path
  try {
    const { 
      startDate, 
      endDate, 
      type, 
      itemCode, 
      category 
    } = req.query;
    
    const query = {};
    
    if (type) query.type = type;
    if (itemCode) query.itemCode = { $regex: itemCode, $options: 'i' };
    if (category) query.category = category;
    
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) query.transactionDate.$gte = new Date(startDate);
      if (endDate) query.transactionDate.$lte = new Date(endDate);
    }
    
    const transactions = await StockTransaction.find(query)
      .populate('performedBy', 'name email')
      .populate('item', 'itemCode itemName')
      .sort({ transactionDate: -1 });

    // Create CSV content
    const csvHeader = [
      'Date',
      'Item Code',
      'Item Name',
      'Transaction Type',
      'Quantity',
      'Unit',
      'Stock Before',
      'Stock After',
      'Description',
      'Reference',
      'Performed By'
    ].join(',');
    
    const csvRows = transactions.map(transaction => [
      `"${new Date(transaction.transactionDate).toLocaleString()}"`,
      `"${transaction.itemCode}"`,
      `"${transaction.itemName}"`,
      `"${transaction.type}"`,
      transaction.quantity,
      `"${transaction.unit}"`,
      transaction.previousStock,
      transaction.newStock,
      `"${transaction.description || ''}"`,
      `"${transaction.reference || ''}"`,
      `"${transaction.performedBy?.name || 'System'}"`
    ].join(','));
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions_export.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting transactions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
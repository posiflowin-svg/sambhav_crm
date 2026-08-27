const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../../middleware/authMiddleware');
const Product = require('../../models/Product');
const StockTransaction = require('../../models/StockTransaction');
const ExternalImportPI = require('../../models/ExternalImportPI');
const ImportProductMapping = require('../../models/ImportProductMapping');

function stockAccess(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!['admin', 'stock_manager', 'dispatcher'].includes(role)) {
    req.flash('error_msg', 'Stock Manager or Admin access required');
    return res.redirect('/dashboard');
  }
  next();
}

router.get('/import-receiving', protect, stockAccess, async (req, res) => {
  try {
    const status = String(req.query.status || 'open');
    const query = { receivingWarehouse: 'Byculla' };
    if (status === 'pending') query.receivingStatus = 'pending';
    else if (status === 'partial') query.receivingStatus = 'partial';
    else if (status === 'received') query.receivingStatus = 'received';
    else if (status === 'open') query.receivingStatus = { $in: ['pending', 'partial'] };

    const imports = await ExternalImportPI.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return res.render('dashboard/stockManager/importReceiving', {
      title: 'Byculla Import Receiving',
      user: req.user,
      imports,
      status
    });
  } catch (error) {
    console.error('Import receiving list error:', error);
    req.flash('error_msg', 'Unable to load import receiving');
    return res.redirect('/dashboard');
  }
});

router.get('/import-receiving/:id', protect, stockAccess, async (req, res) => {
  try {
    const item = await ExternalImportPI.findById(req.params.id)
      .populate('items.mappedProduct', 'itemCode itemName stockQuantity location category unit')
      .lean();

    if (!item) {
      req.flash('error_msg', 'Import PI not found');
      return res.redirect('/dashboard/stock_manager/import-receiving');
    }

    const products = await Product.find({ isActive: { $ne: false } })
      .select('itemCode itemName stockQuantity category location unit')
      .sort({ itemCode: 1 })
      .lean();

    return res.render('dashboard/stockManager/importReceivingDetail', {
      title: `Receive PI ${item.piNumber}`,
      user: req.user,
      item,
      products
    });
  } catch (error) {
    console.error('Import receiving detail error:', error);
    req.flash('error_msg', 'Unable to load import PI');
    return res.redirect('/dashboard/stock_manager/import-receiving');
  }
});

router.post('/import-receiving/:piId/items/:itemId/map', protect, stockAccess, async (req, res) => {
  try {
    const pi = await ExternalImportPI.findById(req.params.piId);
    if (!pi) throw new Error('Import PI not found');

    const item = pi.items.id(req.params.itemId);
    if (!item) throw new Error('Import item not found');

    const productId = String(req.body.productId || '');
    if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Select a Sambhav product');

    const product = await Product.findById(productId);
    if (!product) throw new Error('Sambhav product not found');

    item.mappedProduct = product._id;
    await pi.save();

    if (item.sku) {
      await ImportProductMapping.findOneAndUpdate(
        { sourceSystem: pi.sourceSystem || 'posiflow', sourceSku: item.sku },
        {
          sourceSystem: pi.sourceSystem || 'posiflow',
          sourceProductId: item.sourceProductId || '',
          sourceSku: item.sku,
          sourceProductName: item.productName,
          sambhavProduct: product._id,
          isActive: true,
          updatedBy: req.user._id || req.user.id
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    }

    req.flash('success_msg', `Mapped ${item.productName} to ${product.itemName}`);
  } catch (error) {
    req.flash('error_msg', error.message || 'Unable to map product');
  }
  return res.redirect(`/dashboard/stock_manager/import-receiving/${req.params.piId}`);
});

router.post('/import-receiving/:piId/items/:itemId/create-map', protect, stockAccess, async (req, res) => {
  try {
    const pi = await ExternalImportPI.findById(req.params.piId);
    if (!pi) throw new Error('Import PI not found');

    const item = pi.items.id(req.params.itemId);
    if (!item) throw new Error('Import item not found');

    const itemCode = String(req.body.itemCode || item.sku || '').trim().toUpperCase();
    const itemName = String(req.body.itemName || item.productName || '').trim();
    const category = String(req.body.category || 'POS');
    const location = String(req.body.location || 'Byculla').trim();
    const unit = String(req.body.unit || 'pcs').trim();

    if (!itemCode) throw new Error('SKU / Item Code is required');
    if (!itemName) throw new Error('Product name is required');

    let product = await Product.findOne({ itemCode });
    if (!product) {
      product = await Product.create({
        itemCode,
        itemName,
        description: `Created during import inward for PI ${pi.piNumber}`,
        category,
        location,
        stockQuantity: 0,
        unit,
        price: Number(item.unitPrice || 0),
        minimumStock: 0,
        isActive: true
      });
    }

    item.mappedProduct = product._id;
    await pi.save();

    await ImportProductMapping.findOneAndUpdate(
      { sourceSystem: pi.sourceSystem || 'posiflow', sourceSku: item.sku || itemCode },
      {
        sourceSystem: pi.sourceSystem || 'posiflow',
        sourceProductId: item.sourceProductId || '',
        sourceSku: item.sku || itemCode,
        sourceProductName: item.productName,
        sambhavProduct: product._id,
        isActive: true,
        updatedBy: req.user._id || req.user.id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    req.flash('success_msg', `Product ${product.itemCode} created/mapped successfully`);
  } catch (error) {
    req.flash('error_msg', error.message || 'Unable to create/map product');
  }
  return res.redirect(`/dashboard/stock_manager/import-receiving/${req.params.piId}`);
});

router.post('/import-receiving/:piId/items/:itemId/receive', protect, stockAccess, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pi = await ExternalImportPI.findById(req.params.piId).session(session);
    if (!pi) throw new Error('Import PI not found');

    const item = pi.items.id(req.params.itemId);
    if (!item) throw new Error('Import item not found');

    const receiveQty = Number(req.body.receiveQty || 0);
    const pendingQty = Math.max(0, Number(item.quantity || 0) - Number(item.receivedQuantity || 0));

    if (!(receiveQty > 0)) throw new Error('Receive quantity must be greater than 0');
    if (receiveQty > pendingQty) throw new Error(`Maximum pending quantity is ${pendingQty}`);

    let product = null;
    if (item.mappedProduct) {
      product = await Product.findById(item.mappedProduct).session(session);
    }

    if (!product && item.sku) {
      const savedMapping = await ImportProductMapping.findOne({
        sourceSystem: pi.sourceSystem || 'posiflow',
        sourceSku: item.sku,
        isActive: true
      }).session(session);
      if (savedMapping) {
        product = await Product.findById(savedMapping.sambhavProduct).session(session);
        if (product) item.mappedProduct = product._id;
      }
    }

    if (!product) {
      throw new Error('Product is not mapped. Select an existing product or use Create Product & Map first.');
    }

    const previousStock = Number(product.stockQuantity || 0);
    product.stockQuantity = previousStock + receiveQty;
    product.lastUpdated = new Date();
    await product.save({ session });

    await StockTransaction.create([{
      type: 'stock_in',
      item: product._id,
      itemCode: product.itemCode,
      itemName: product.itemName,
      category: product.category,
      location: product.location || 'Byculla',
      quantity: receiveQty,
      unit: product.unit || 'pcs',
      previousStock,
      newStock: product.stockQuantity,
      reference: `import_pi:${pi.piNumber}`,
      description: `Byculla import inward against PI ${pi.piNumber}. Source: ${pi.importCompany || 'Posiflow'}`,
      performedBy: req.user._id || req.user.id,
      transactionDate: new Date()
    }], { session });

    item.receivedQuantity = Number(item.receivedQuantity || 0) + receiveQty;

    const totalQty = pi.items.reduce((s, row) => s + Number(row.quantity || 0), 0);
    const totalReceived = pi.items.reduce((s, row) => s + Number(row.receivedQuantity || 0), 0);

    pi.receivingStatus = totalReceived <= 0
      ? 'pending'
      : (totalReceived >= totalQty ? 'received' : 'partial');

    if (pi.receivingStatus === 'received') pi.receivedAt = new Date();

    await pi.save({ session });

    await session.commitTransaction();
    req.flash(
      'success_msg',
      `Received ${receiveQty} ${product.unit || 'pcs'} of ${product.itemName}. Remaining: ${Math.max(0, pendingQty - receiveQty)}`
    );
  } catch (error) {
    await session.abortTransaction();
    req.flash('error_msg', error.message || 'Unable to receive stock');
  } finally {
    session.endSession();
  }

  return res.redirect(`/dashboard/stock_manager/import-receiving/${req.params.piId}`);
});

router.get('/product-mapping', protect, stockAccess, async (req, res) => {
  try {
    const [mappings, products, imports] = await Promise.all([
      ImportProductMapping.find({ isActive: true })
        .populate('sambhavProduct', 'itemCode itemName stockQuantity')
        .sort({ updatedAt: -1 })
        .lean(),
      Product.find({ isActive: { $ne: false } })
        .select('itemCode itemName stockQuantity')
        .sort({ itemCode: 1 })
        .lean(),
      ExternalImportPI.find({ receivingWarehouse: 'Byculla' })
        .select('items')
        .lean()
    ]);

    const sourceProductsMap = new Map();
    imports.forEach(pi => {
      (pi.items || []).forEach(item => {
        if (!item.sku) return;
        sourceProductsMap.set(item.sku, {
          sku: item.sku,
          name: item.productName,
          sourceProductId: item.sourceProductId || ''
        });
      });
    });

    return res.render('dashboard/stockManager/importProductMapping', {
      title: 'Import Product Mapping',
      user: req.user,
      mappings,
      products,
      sourceProducts: Array.from(sourceProductsMap.values()).sort((a,b) => a.sku.localeCompare(b.sku))
    });
  } catch (error) {
    console.error('Import mapping page error:', error);
    req.flash('error_msg', 'Unable to load product mapping');
    return res.redirect('/dashboard/stock_manager/import-receiving');
  }
});

router.post('/product-mapping', protect, stockAccess, async (req, res) => {
  try {
    const sourceSku = String(req.body.sourceSku || '').trim().toUpperCase();
    const sourceProductName = String(req.body.sourceProductName || '').trim();
    const productId = String(req.body.productId || '');

    if (!sourceSku) throw new Error('Source SKU is required');
    if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Select Sambhav product');

    const product = await Product.findById(productId);
    if (!product) throw new Error('Sambhav product not found');

    const mapping = await ImportProductMapping.findOneAndUpdate(
      { sourceSystem: 'posiflow', sourceSku },
      {
        sourceSystem: 'posiflow',
        sourceSku,
        sourceProductName,
        sambhavProduct: product._id,
        isActive: true,
        updatedBy: req.user._id || req.user.id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Back-fill this mapping into pending imported PI items.
    await ExternalImportPI.updateMany(
      {
        receivingWarehouse: 'Byculla',
        'items.sku': sourceSku
      },
      {
        $set: { 'items.$[row].mappedProduct': product._id }
      },
      {
        arrayFilters: [{ 'row.sku': sourceSku }]
      }
    );

    req.flash('success_msg', `Mapped ${sourceSku} to ${product.itemCode}`);
  } catch (error) {
    req.flash('error_msg', error.message || 'Unable to save mapping');
  }
  return res.redirect('/dashboard/stock_manager/product-mapping');
});

module.exports = router;

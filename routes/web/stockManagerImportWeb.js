const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const { protect } = require('../../middleware/authMiddleware');
const Product = require('../../models/Product');
const StockTransaction = require('../../models/StockTransaction');
const ExternalImportPI = require('../../models/ExternalImportPI');
const ImportProductMapping = require('../../models/ImportProductMapping');


async function notifyPosiflowReceivingStatus(pi) {
  const baseUrl = String(
    process.env.POSIFLOW_CRM_URL || 'https://handover-nhia.onrender.com'
  ).replace(/\/+$/, '');
  const token = String(
    process.env.INTERCRM_SYNC_TOKEN || 'pf-sambhav-byculla-sync-v1-20260827'
  );

  const totalQty = (pi.items || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalReceived = (pi.items || []).reduce((sum, row) => sum + Number(row.receivedQuantity || 0), 0);

  try {
    await axios.post(
      `${baseUrl}/api/intercrm/sambhav/import-receiving-status`,
      {
        sourcePiId: String(pi.sourcePiId || ''),
        piNumber: String(pi.piNumber || ''),
        receivingStatus: String(pi.receivingStatus || 'pending'),
        receivedAt: pi.receivedAt || null,
        totalQty,
        totalReceived
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-InterCRM-Token': token
        },
        timeout: 15000,
        validateStatus: status => status >= 200 && status < 300
      }
    );
  } catch (error) {
    // Stock inward is already committed in Sambhav. Never roll it back because
    // the Posiflow status callback failed; log it so the next action/resync can retry.
    console.error('[Posiflow Receiving Callback] Failed', {
      piNumber: pi.piNumber,
      status: error.response?.status,
      message: error.response?.data?.message || error.message
    });
  }
}

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
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new Error('Select a Sambhav product');
    }

    const product = await Product.findById(productId);
    if (!product) throw new Error('Selected Sambhav product not found');

    // IMPORTANT: when user selects an existing Sambhav product, always keep
    // that exact product ID on the import item. Receive In must stock this ID.
    item.mappedProduct = product._id;
    await pi.save();

    const sourceSku = String(item.sku || '').trim().toUpperCase();
    if (sourceSku) {
      await ImportProductMapping.findOneAndUpdate(
        { sourceSystem: pi.sourceSystem || 'posiflow', sourceSku },
        {
          sourceSystem: pi.sourceSystem || 'posiflow',
          sourceProductId: item.sourceProductId || '',
          sourceSku,
          sourceProductName: item.productName || '',
          sambhavProduct: product._id,
          isActive: true,
          updatedBy: req.user._id || req.user.id
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Back-fill the same mapping into every pending/partial import item
      // with this source SKU so future PIs use the existing Sambhav product.
      await ExternalImportPI.updateMany(
        {
          receivingWarehouse: 'Byculla',
          receivingStatus: { $in: ['pending', 'partial'] },
          'items.sku': sourceSku
        },
        { $set: { 'items.$[row].mappedProduct': product._id } },
        { arrayFilters: [{ 'row.sku': sourceSku }] }
      );
    }

    req.flash(
      'success_msg',
      `Mapped ${item.productName || item.sku} to existing Sambhav product ${product.itemCode} · ${product.itemName}`
    );
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

    // Never silently create a duplicate. If this Item Code already exists,
    // map the import item to that existing product instead.
    let product = await Product.findOne({
      itemCode: { $regex: `^${itemCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
    });

    if (product) {
      item.mappedProduct = product._id;
      await pi.save();

      await ImportProductMapping.findOneAndUpdate(
        {
          sourceSystem: pi.sourceSystem || 'posiflow',
          sourceSku: String(item.sku || itemCode).trim().toUpperCase()
        },
        {
          sourceSystem: pi.sourceSystem || 'posiflow',
          sourceProductId: item.sourceProductId || '',
          sourceSku: String(item.sku || itemCode).trim().toUpperCase(),
          sourceProductName: item.productName || '',
          sambhavProduct: product._id,
          isActive: true,
          updatedBy: req.user._id || req.user.id
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      req.flash(
        'success_msg',
        `Existing product ${product.itemCode} · ${product.itemName} found and mapped. No duplicate product was created.`
      );
      return res.redirect(`/dashboard/stock_manager/import-receiving/${req.params.piId}`);
    }

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

    item.mappedProduct = product._id;
    await pi.save();

    await ImportProductMapping.findOneAndUpdate(
      {
        sourceSystem: pi.sourceSystem || 'posiflow',
        sourceSku: String(item.sku || itemCode).trim().toUpperCase()
      },
      {
        sourceSystem: pi.sourceSystem || 'posiflow',
        sourceProductId: item.sourceProductId || '',
        sourceSku: String(item.sku || itemCode).trim().toUpperCase(),
        sourceProductName: item.productName || '',
        sambhavProduct: product._id,
        isActive: true,
        updatedBy: req.user._id || req.user.id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    req.flash('success_msg', `Product ${product.itemCode} created and mapped successfully`);
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
    const pendingQty = Math.max(
      0,
      Number(item.quantity || 0) - Number(item.receivedQuantity || 0)
    );

    if (!(receiveQty > 0)) throw new Error('Receive quantity must be greater than 0');
    if (receiveQty > pendingQty) {
      throw new Error(`Maximum pending quantity is ${pendingQty}`);
    }

    if (!item.mappedProduct) {
      throw new Error(
        'Product is not mapped. Select an existing Sambhav product or use Create Product & Map first.'
      );
    }

    // Critical fix:
    // Receive In must always increment the exact Sambhav product chosen in mapping.
    // Do not create/search another product during inward.
    const product = await Product.findById(item.mappedProduct).session(session);
    if (!product) {
      throw new Error('Mapped Sambhav product no longer exists. Please remap this item.');
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
      description: `Byculla import inward against PI ${pi.piNumber}. Source item: ${item.productName || item.sku}. Mapped to existing Sambhav product ${product.itemCode}.`,
      performedBy: req.user._id || req.user.id,
      transactionDate: new Date()
    }], { session });

    item.receivedQuantity = Number(item.receivedQuantity || 0) + receiveQty;

    const totalQty = pi.items.reduce(
      (sum, row) => sum + Number(row.quantity || 0),
      0
    );
    const totalReceived = pi.items.reduce(
      (sum, row) => sum + Number(row.receivedQuantity || 0),
      0
    );

    pi.receivingStatus =
      totalReceived <= 0
        ? 'pending'
        : (totalReceived >= totalQty ? 'received' : 'partial');

    if (pi.receivingStatus === 'received') {
      pi.receivedAt = new Date();
    }

    await pi.save({ session });
    await session.commitTransaction();

    // Keep Posiflow PI stage in sync with the Sambhav Byculla inward result.
    await notifyPosiflowReceivingStatus(pi);

    req.flash(
      'success_msg',
      `Received ${receiveQty} ${product.unit || 'pcs'} into ${product.itemCode} · ${product.itemName}. Stock ${previousStock} → ${product.stockQuantity}. Remaining: ${Math.max(0, pendingQty - receiveQty)}`
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

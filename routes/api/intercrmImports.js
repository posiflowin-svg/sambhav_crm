const express = require('express');
const router = express.Router();
const ExternalImportPI = require('../../models/ExternalImportPI');
const ImportProductMapping = require('../../models/ImportProductMapping');
const Product = require('../../models/Product');
const { reconcileDuplicateLines, refreshReceivingStatus } = require('../../utils/importReceivingLines');

function intercrmAuth(req, res, next) {
  const expected = String(process.env.INTERCRM_SYNC_TOKEN || 'pf-sambhav-byculla-sync-v1-20260827');
  const received = String(req.get('X-InterCRM-Token') || '');
  if (!expected || !received || received !== expected) {
    return res.status(401).json({ success: false, message: 'Invalid inter-CRM token' });
  }
  next();
}


router.get('/products', intercrmAuth, async (req, res) => {
  try {
    const products = await Product.find({ isActive: { $ne: false } })
      .select('_id itemCode itemName category location stockQuantity unit price isActive')
      .sort({ itemName: 1, itemCode: 1 })
      .lean();

    return res.json({
      success: true,
      products: products.map(product => ({
        _id: String(product._id),
        itemCode: String(product.itemCode || ''),
        itemName: String(product.itemName || ''),
        category: String(product.category || ''),
        location: String(product.location || ''),
        stockQuantity: Number(product.stockQuantity || 0),
        unit: String(product.unit || 'pcs'),
        price: Number(product.price || 0)
      }))
    });
  } catch (error) {
    console.error('[InterCRM Product Catalog]', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to load Sambhav products' });
  }
});

router.post('/import-pis', intercrmAuth, async (req, res) => {
  try {
    const payload = req.body || {};

    if (String(payload.receivingWarehouse || '') !== 'Byculla') {
      return res.status(400).json({
        success: false,
        message: 'Only Byculla warehouse PIs can be assigned to Sambhav CRM'
      });
    }

    if (!payload.sourcePiId || !payload.piNumber) {
      return res.status(400).json({
        success: false,
        message: 'sourcePiId and piNumber are required'
      });
    }

    const incomingItems = Array.isArray(payload.items) ? payload.items : [];
    const existing = await ExternalImportPI.findOne({ sourcePiId: String(payload.sourcePiId) });

    if (existing) reconcileDuplicateLines(existing.items);
    const mergedItems = [];
    const usedOldItems = new Set();
    for (const [incomingIndex, incoming] of incomingItems.entries()) {
      const sku = String(incoming.sku || '').trim().toUpperCase();
      // Match one-to-one: never reuse the first same-SKU row for every line.
      const oldItems = existing?.items || [];
      let oldIndex = -1;
      if (incoming.sourceItemId) oldIndex = oldItems.findIndex((item, index) =>
        !usedOldItems.has(index) && item.sourceItemId &&
        item.sourceItemId === String(incoming.sourceItemId));
      if (oldIndex < 0 && oldItems[incomingIndex] && !usedOldItems.has(incomingIndex) &&
          String(oldItems[incomingIndex].sku || '') === sku) oldIndex = incomingIndex;
      if (oldIndex < 0) oldIndex = oldItems.findIndex((item, index) =>
        !usedOldItems.has(index) && item.sku === sku);
      if (oldIndex >= 0) usedOldItems.add(oldIndex);
      const old = oldIndex >= 0 ? oldItems[oldIndex] : null;

      let mappedProduct = old?.mappedProduct || null;
      if (!mappedProduct && sku) {
        const savedMapping = await ImportProductMapping.findOne({
          sourceSystem: String(payload.sourceSystem || 'posiflow'),
          sourceSku: sku,
          isActive: true
        }).lean();

        if (savedMapping?.sambhavProduct) {
          mappedProduct = savedMapping.sambhavProduct;
        } else {
          const sameSkuProduct = await Product.findOne({
            itemCode: sku,
            isActive: { $ne: false }
          }).select('_id').lean();
          if (sameSkuProduct) mappedProduct = sameSkuProduct._id;
        }
      }

      mergedItems.push({
        sourceItemId: String(incoming.sourceItemId || ''),
        sourceProductId: String(incoming.sourceProductId || ''),
        productName: String(incoming.productName || sku || 'Imported Product'),
        sku,
        quantity: Number(incoming.quantity || 0),
        receivedQuantity: Number(old?.receivedQuantity || 0),
        unitPrice: Number(incoming.unitPrice || 0),
        amount: Number(incoming.amount || 0),
        stockEntryType: String(incoming.stockEntryType || 'finished_good'),
        mappedProduct
      });
    }

    const update = {
      sourceSystem: String(payload.sourceSystem || 'posiflow'),
      sourcePiId: String(payload.sourcePiId),
      piNumber: String(payload.piNumber),
      piDate: payload.piDate || null,
      importCompany: String(payload.importCompany || ''),
      receivingWarehouse: 'Byculla',
      supplier: payload.supplier || null,
      currency: String(payload.currency || 'USD'),
      exchangeRate: Number(payload.exchangeRate || 1),
      totalAmount: Number(payload.totalAmount || 0),
      paymentStatus: String(payload.paymentStatus || ''),
      sourceStatus: String(payload.status || ''),
      remarks: String(payload.remarks || ''),
      items: mergedItems,
      lastSyncedAt: new Date()
    };

    let record;
    if (existing) {
      Object.assign(existing, update);
      reconcileDuplicateLines(existing.items);
      refreshReceivingStatus(existing);
      record = await existing.save();
    } else {
      record = await ExternalImportPI.create(update);
    }

    return res.json({
      success: true,
      externalId: String(record._id),
      item: record
    });
  } catch (error) {
    console.error('[InterCRM Import PI]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to receive PI from Posiflow'
    });
  }
});


// INTERCRM_API_NOT_FOUND
router.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Inter-CRM API route not found',
    path: req.originalUrl
  });
});

module.exports = router;

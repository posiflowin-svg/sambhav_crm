const express = require('express');
const router = express.Router();
const ExternalImportPI = require('../../models/ExternalImportPI');
const ImportProductMapping = require('../../models/ImportProductMapping');
const Product = require('../../models/Product');

function intercrmAuth(req, res, next) {
  const expected = String(process.env.INTERCRM_SYNC_TOKEN || 'pf-sambhav-byculla-sync-v1-20260827');
  const received = String(req.get('X-InterCRM-Token') || '');
  if (!expected || !received || received !== expected) {
    return res.status(401).json({ success: false, message: 'Invalid inter-CRM token' });
  }
  next();
}

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

    const mergedItems = [];
    for (const incoming of incomingItems) {
      const sku = String(incoming.sku || '').trim().toUpperCase();
      const old = existing?.items?.find(item =>
        (incoming.sourceItemId && item.sourceItemId === String(incoming.sourceItemId)) ||
        (sku && item.sku === sku)
      );

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
      // Never downgrade receiving progress because of a re-sync.
      const totalQty = existing.items.reduce((s, i) => s + Number(i.quantity || 0), 0);
      const receivedQty = existing.items.reduce((s, i) => s + Number(i.receivedQuantity || 0), 0);
      existing.receivingStatus = receivedQty <= 0
        ? 'pending'
        : (receivedQty >= totalQty ? 'received' : 'partial');
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

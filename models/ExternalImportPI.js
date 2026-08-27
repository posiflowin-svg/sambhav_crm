const mongoose = require('mongoose');

const externalImportItemSchema = new mongoose.Schema({
  sourceItemId: { type: String, default: '' },
  sourceProductId: { type: String, default: '' },
  productName: { type: String, required: true, trim: true },
  sku: { type: String, default: '', trim: true, uppercase: true, index: true },
  quantity: { type: Number, required: true, min: 0 },
  receivedQuantity: { type: Number, default: 0, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 },
  stockEntryType: { type: String, default: 'finished_good' },
  mappedProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }
}, { _id: true });

const externalImportPISchema = new mongoose.Schema({
  sourceSystem: { type: String, default: 'posiflow', index: true },
  sourcePiId: { type: String, required: true, unique: true, index: true },
  piNumber: { type: String, required: true, index: true },
  piDate: { type: Date },
  importCompany: { type: String, default: '' },
  receivingWarehouse: { type: String, default: 'Byculla', index: true },
  supplier: {
    id: String,
    companyName: String,
    supplierCode: String
  },
  currency: { type: String, default: 'USD' },
  exchangeRate: { type: Number, default: 1 },
  totalAmount: { type: Number, default: 0 },
  paymentStatus: { type: String, default: '' },
  sourceStatus: { type: String, default: '' },
  remarks: { type: String, default: '' },
  items: [externalImportItemSchema],
  receivingStatus: {
    type: String,
    enum: ['pending', 'partial', 'received'],
    default: 'pending',
    index: true
  },
  receivedAt: { type: Date },
  lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ExternalImportPI', externalImportPISchema);

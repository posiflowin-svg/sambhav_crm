// models/Order.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  product: {                                // reference to Product
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: { type: String, required: true },  // denormalized for quick access
  quantity: { type: Number, required: true, min: 1 },
  rate: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 }
});

const orderSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  salesPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  products: [productSchema],

  orderDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  invoiceNo: { type: String, required: true },
  poNumber: String,
  poDate: Date,

  orderType: {
    type: String,
    required: true,
    enum: ['cod', 'prepaid', 'credit']
  },
  creditAmount: {
    type: Number,
    default: 0,
    validate: {
      validator: function(v) {
        return this.orderType !== 'credit' || v > 0;
      },
      message: 'Credit amount is required for credit orders'
    }
  },

  includeGst: { type: Boolean, default: true },

  subtotal: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  cgst: { type: Number, required: true },
  sgst: { type: Number, required: true },
  roundOff: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },

  piDocument: {
    original: String,
    updated: String
  },

  status: {
    type: String,
    enum: ['pending', 'approved', 'dispatched', 'delivered', 'cancelled'],
    default: 'pending'
  },

  trackingId: String,

  approvedAt: Date,
  dispatchedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  
  isPassiveRepeat: {
    type: Boolean,
    default: false
  },
  billPunch: { type: Boolean, default: false },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
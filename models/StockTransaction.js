const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'stock_in',
      'stock_out',
      'adjustment',
      'damage',
      'transfer'
    ],
    required: true
  },
  item: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    ref: 'Product'
  },
  itemCode: {
    type: String,
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  category: {
    type: String
  },
  location: {
    type: String
  },
  quantity: { 
    type: Number, 
    required: true 
  },
  unit: { 
    type: String, 
    required: true 
  },
  previousStock: { 
    type: Number, 
    required: true 
  },
  newStock: { 
    type: Number, 
    required: true 
  },
  reference: { 
    type: String 
  },
  referenceId: { 
    type: mongoose.Schema.Types.ObjectId 
  },
  description: { 
    type: String 
  },
  performedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  transactionDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
stockTransactionSchema.index({ item: 1 });
stockTransactionSchema.index({ type: 1 });
stockTransactionSchema.index({ transactionDate: -1 });
stockTransactionSchema.index({ itemCode: 1 });
stockTransactionSchema.index({ category: 1 });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
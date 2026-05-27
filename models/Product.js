const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  itemCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Components', 'Display', 'TFT Display', 'POS', 'Printer']
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  stockQuantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  unit: {
    type: String,
    required: true,
    default: 'pcs'
  },
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  minimumStock: {
    type: Number,
    default: 0,
    min: 0
  },
  maximumStock: {
    type: Number,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
// productSchema.index({ itemCode: 1 });
productSchema.index({ category: 1 });
productSchema.index({ location: 1 });
productSchema.index({ stockQuantity: 1 });
productSchema.index({ isActive: 1 });

// Virtual for low stock alert
productSchema.virtual('isLowStock').get(function() {
  return this.minimumStock > 0 && this.stockQuantity <= this.minimumStock;
});

// Method to update stock with transaction
productSchema.methods.updateStock = async function(quantity, type, performedBy, reference = null, description = '') {
  const previousStock = this.stockQuantity;
  const newStock = previousStock + quantity;
  
  // Validate stock doesn't go negative
  if (newStock < 0) {
    throw new Error(`Insufficient stock. Available: ${previousStock}, Requested: ${-quantity}`);
  }
  
  // Update product stock
  this.stockQuantity = newStock;
  this.lastUpdated = Date.now();
  await this.save();
  
  // Create stock transaction
  const StockTransaction = mongoose.model('StockTransaction');
  await StockTransaction.create({
    type,
    item: this._id,
    itemModel: 'Product',
    itemName: this.itemName,
    itemCode: this.itemCode,
    quantity,
    unit: this.unit,
    previousStock,
    newStock,
    reference,
    description,
    performedBy
  });
  
  return this;
};

module.exports = mongoose.model('Product', productSchema);
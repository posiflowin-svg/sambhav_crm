// models/ProductOrder.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    unit: {
      type: String,
      default: 'pcs'
    },
    pricePerUnit: {
      type: Number,
      required: true,
      min: 0
    },
    subtotal: {
      type: Number,
      default: 0
    },
    receivedHistory: [{
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      receivedDate: {
        type: Date,
        default: Date.now
      },
      receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      notes: String
    }]
  }],
  reversal: { reason: String, reversedAt: Date, reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, quantities: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, quantity: Number }] },
  status: {
    type: String,
    enum: ['pending', 'ordered', 'shipped', 'delivered', 'cancelled', 'partially_delivered'],
    default: 'pending'
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  expectedDelivery: {
    type: Date
  },
  actualDelivery: {
    type: Date
  },
  supplier: {
    name: String,
    contact: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: {
    type: String
  },
  totalCost: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Calculate subtotal for each item before saving
orderSchema.pre('save', function(next) {
  // Calculate subtotal for each item
  this.items.forEach(item => {
    if (item.pricePerUnit && item.quantity) {
      item.subtotal = item.pricePerUnit * item.quantity;
    }
  });
  
  // Calculate total order cost
  this.totalCost = this.items.reduce((total, item) => {
    return total + (item.subtotal || 0);
  }, 0);
  
  next();
});

// Virtual for remaining quantity
orderSchema.virtual('items.remainingQuantity').get(function() {
  return this.items.map(item => ({
    product: item.product,
    remaining: item.quantity - item.receivedQuantity,
    itemId: item._id,
    pricePerUnit: item.pricePerUnit,
    remainingValue: (item.quantity - item.receivedQuantity) * item.pricePerUnit
  }));
});

// Method to get received value
orderSchema.methods.getReceivedValue = function() {
  return this.items.reduce((total, item) => {
    return total + (item.receivedQuantity * item.pricePerUnit);
  }, 0);
};

// Method to get remaining value
orderSchema.methods.getRemainingValue = function() {
  return this.items.reduce((total, item) => {
    return total + ((item.quantity - item.receivedQuantity) * item.pricePerUnit);
  }, 0);
};

// Method to check if order is fully received
orderSchema.methods.isFullyReceived = function() {
  return this.items.every(item => item.receivedQuantity >= item.quantity);
};

// Method to check if order is partially received
orderSchema.methods.isPartiallyReceived = function() {
  return this.items.some(item => item.receivedQuantity > 0 && item.receivedQuantity < item.quantity);
};

// Update status based on received quantities
orderSchema.methods.updateStatus = function() {
  if (this.isFullyReceived()) {
    this.status = 'delivered';
    this.actualDelivery = new Date();
  } else if (this.isPartiallyReceived()) {
    this.status = 'partially_delivered';
  }
  return this.status;
};

// Generate order number before saving
// orderSchema.pre('save', async function(next) {
//   if (this.isNew) {
//     const count = await mongoose.model('ProductOrder').countDocuments();
//     this.orderNumber = `ORD-${Date.now()}-${count + 1}`;
//   }
//   next();
// });

module.exports = mongoose.model('ProductOrder', orderSchema);
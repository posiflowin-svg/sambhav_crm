const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    default: 1
  },
  targetPrice: {
    type: Number,
    default: null
  },
  chinaPrice: {
    type: Number,
    default: null
  },
  finalSellingPrice: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: [
      'pending',
      'china-searching',
      'china-priced',
      'sent-to-sales',
      'quoted-to-customer',
      'won',
      'lost'
    ],
    default: 'pending'
  }
}, { _id: false });


const noteSchema = new mongoose.Schema({
  message: String,
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  role: {
    type: String,
    enum: ['china', 'sales', 'admin']
  },
  parentNoteId: {  // Add this for replies to specific notes
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  isEdited: {  // Track if note was edited
    type: Boolean,
    default: false
  },
  editedAt: {  // When it was edited
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const inquirySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },

  products: [productSchema],

  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
    index: true  // Add index for filtering/sorting by rating
  },

  assignedChinaPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  assignedSalesPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  overallStatus: {
    type: String,
    enum: [
      'new',
      'china-processing',
      'pricing-ready',
      'sales-processing',
      'completed',
      'cancelled'
    ],
    default: 'new'
  },

  notes: [noteSchema],

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp automatically
inquirySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster filtering
inquirySchema.index({ overallStatus: 1 });
inquirySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Inquiry', inquirySchema);
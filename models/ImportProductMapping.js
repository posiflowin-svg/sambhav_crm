const mongoose = require('mongoose');

const importProductMappingSchema = new mongoose.Schema({
  sourceSystem: { type: String, default: 'posiflow', index: true },
  sourceProductId: { type: String, default: '', index: true },
  sourceSku: { type: String, required: true, trim: true, uppercase: true, index: true },
  sourceProductName: { type: String, default: '', trim: true },
  sambhavProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

importProductMappingSchema.index(
  { sourceSystem: 1, sourceSku: 1 },
  { unique: true }
);

module.exports = mongoose.model('ImportProductMapping', importProductMappingSchema);

const mongoose = require('mongoose');
// Separate collection keeps large binary files out of inquiry listing queries.
const schema = new mongoose.Schema({
  inquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry', required: true, index: true },
  filename: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  content: { type: Buffer, required: true, select: false },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('InquiryAttachment', schema);

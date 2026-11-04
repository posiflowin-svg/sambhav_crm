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
// MongoDB automatically removes expired attachment documents, including binary content.
// TTL cleanup is asynchronous, so API routes also exclude expired documents.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });
module.exports = mongoose.model('InquiryAttachment', schema);

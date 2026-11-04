const express = require('express');
const router = express.Router();
const inquiryController = require('../../controllers/inquiryController');
const { protect } = require('../../middleware/authMiddleware');
const Inquiry = require('../../models/Inquiry');
const InquiryAttachment = require('../../models/InquiryAttachment');
const multer = require('multer');
const mongoose = require('mongoose');
const allowedAttachments = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.xls', 'application/vnd.ms-excel'], ['.csv', 'text/csv']
]);
const path = require('path');
const attachmentUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const expected = allowedAttachments.get(ext);
    if (!expected || (file.mimetype !== expected && !(ext === '.csv' && ['application/vnd.ms-excel', 'application/octet-stream'].includes(file.mimetype))))
      return cb(new Error('Only JPG, PNG, WEBP, XLS, XLSX or CSV files are allowed'));
    cb(null, true);
  }
});
function uploadFiles(req, res, next) {
  attachmentUpload.array('attachments', 5)(req, res, err => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}


// All routes are protected
router.use(protect);

router.get('/company', inquiryController.getCompanyInquiries);

// GET /api/inquiries - Get all inquiries with filters
router.get('/', inquiryController.getInquiries);

// GET /api/inquiries/search - Search inquiries
router.get('/search', inquiryController.searchInquiry);

// Attachment endpoints are shared by Sales CRM and Inquiry Management.
router.get('/:inquiryId/attachments', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.inquiryId)) return res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
    if (!await Inquiry.exists({ _id: req.params.inquiryId })) return res.status(404).json({ success: false, message: 'Inquiry not found' });
    const data = await InquiryAttachment.find({ inquiryId: req.params.inquiryId }).select('filename mimeType size createdAt').sort({ createdAt: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: 'Unable to list attachments' }); }
});
router.post('/:inquiryId/attachments', uploadFiles, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.inquiryId)) return res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
    if (!await Inquiry.exists({ _id: req.params.inquiryId })) return res.status(404).json({ success: false, message: 'Inquiry not found' });
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'Select files first' });
    const existing = await InquiryAttachment.countDocuments({ inquiryId: req.params.inquiryId });
    if (existing + req.files.length > 20) return res.status(400).json({ success: false, message: 'Maximum 20 attachments per inquiry' });
    await InquiryAttachment.insertMany(req.files.map(f => ({
      inquiryId: req.params.inquiryId, filename: path.basename(f.originalname).slice(0, 180),
      mimeType: f.mimetype, size: f.size, content: f.buffer, uploadedBy: req.user._id
    })));
    res.json({ success: true, message: 'Attachments uploaded' });
  } catch (err) { res.status(500).json({ success: false, message: 'Attachment upload failed' }); }
});
router.get('/:inquiryId/attachments/:attachmentId/download', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.inquiryId) || !mongoose.isValidObjectId(req.params.attachmentId)) return res.status(400).end();
    if (!await Inquiry.exists({ _id: req.params.inquiryId })) return res.status(404).end();
    const file = await InquiryAttachment.findOne({ _id: req.params.attachmentId, inquiryId: req.params.inquiryId }).select('+content');
    if (!file) return res.status(404).end();
    res.set('Content-Type', file.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.attachment(file.filename);
    res.send(file.content);
  } catch (err) { res.status(500).end(); }
});
router.delete('/:inquiryId/attachments/:attachmentId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.inquiryId) || !mongoose.isValidObjectId(req.params.attachmentId)) return res.status(400).end();
    const inquiry = await Inquiry.findById(req.params.inquiryId);
    if (!inquiry) return res.status(404).end();
    const role = req.user.role;
    const owner = String(inquiry.createdBy) === String(req.user._id);
    if (!owner && role !== 'admin') return res.status(403).json({ success: false, message: 'Only inquiry creator or admin can delete attachments' });
    await InquiryAttachment.deleteOne({ _id: req.params.attachmentId, inquiryId: inquiry._id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: 'Unable to delete attachment' }); }
});

// GET /api/inquiries/:inquiryId - Get single inquiry (this comes after specific routes)
router.get('/:inquiryId', inquiryController.getInquiry);

// POST /api/inquiries - Create new inquiry
router.post('/', inquiryController.createInquiry);

// PUT /api/inquiries/:inquiryId - Update inquiry
router.put('/:inquiryId', inquiryController.updateInquiry);

// DELETE /api/inquiries/:inquiryId - Delete inquiry
router.delete('/:inquiryId', inquiryController.deleteInquiry);

// PATCH /api/inquiries/:inquiryId/products/status - Update product status
router.patch('/:inquiryId/products/status', inquiryController.updateProductStatus);

// POST /api/inquiries/:inquiryId/notes - Add a new note
router.post('/:inquiryId/notes', inquiryController.addNote);

// PUT /api/inquiries/:inquiryId/notes/:noteId - Update a specific note
router.put('/:inquiryId/notes/:noteId', inquiryController.updateNote);

// POST /api/inquiries/:inquiryId/notes/:noteId/reply - Reply to a specific note
router.post('/:inquiryId/notes/:noteId/reply', inquiryController.replyToNote);

// In your inquiryRoutes.js
router.patch('/:inquiryId/rating', async (req, res) => {
    try {
        console.log('Request body:', req.body); // Debug log
        console.log('Request params:', req.params); // Debug log
        
        const { inquiryId } = req.params;
        const { rating } = req.body;
        
        // Check if rating is provided
        if (rating === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Rating value is required'
            });
        }
        
        // Validate rating - allow null or number between 1-5
        if (rating !== null && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be a number between 1 and 5, or null'
            });
        }
        
        // Update the inquiry
        const updatedInquiry = await Inquiry.findByIdAndUpdate(
            inquiryId,
            { 
                rating: rating,
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        ).populate('companyId assignedChinaPerson assignedSalesPerson createdBy');
        
        if (!updatedInquiry) {
            return res.status(404).json({
                success: false,
                message: 'Inquiry not found'
            });
        }
        
        res.json({
            success: true,
            data: updatedInquiry,
            message: rating ? `Rating updated to ${rating} star${rating !== 1 ? 's' : ''}` : 'Rating cleared'
        });
    } catch (error) {
        console.error('Error updating rating:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update rating',
            error: error.message
        });
    }
});

module.exports = router;
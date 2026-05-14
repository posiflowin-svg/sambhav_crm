const express = require('express');
const router = express.Router();
const inquiryController = require('../../controllers/inquiryController');
const { protect } = require('../../middleware/authMiddleware');
const Inquiry = require('../../models/Inquiry');

// All routes are protected
router.use(protect);

router.get('/company', inquiryController.getCompanyInquiries);

// GET /api/inquiries - Get all inquiries with filters
router.get('/', inquiryController.getInquiries);

// GET /api/inquiries/search - Search inquiries
router.get('/search', inquiryController.searchInquiry);

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
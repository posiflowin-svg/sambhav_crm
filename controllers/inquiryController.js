const InquiryService = require('../services/inquiryService');

/**
 * Get all inquiries with filters
 */
exports.getInquiries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    
    const filters = {
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      status: req.query.status,
      search: req.query.search,
      assignedChina: req.query.assignedChina,
      assignedSales: req.query.assignedSales
    };

    const [inquiriesData, statistics] = await Promise.all([
      InquiryService.getInquiries(filters, page, limit),
      InquiryService.getStatistics(filters)
    ]);

    res.json({
      success: true,
      ...inquiriesData,
      statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get single inquiry
 */
exports.getInquiry = async (req, res) => {
  try {
    const inquiry = await InquiryService.getInquiryById(req.params.inquiryId);
    
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    res.json({
      success: true,
      data: inquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Create inquiry
 */
exports.createInquiry = async (req, res) => {
  try {
    const inquiry = await InquiryService.createInquiry(req.body, req.user._id);

    res.status(201).json({
      success: true,
      message: 'Inquiry created successfully',
      data: inquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Update inquiry
 */
exports.updateInquiry = async (req, res) => {
  try {
    const inquiry = await InquiryService.updateInquiry(req.params.inquiryId, req.body);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    res.json({
      success: true,
      message: 'Inquiry updated successfully',
      data: inquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Delete inquiry
 */
exports.deleteInquiry = async (req, res) => {
  try {
    const inquiry = await InquiryService.deleteInquiry(req.params.inquiryId);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    res.json({
      success: true,
      message: 'Inquiry deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Add note to inquiry
 */
exports.addNote = async (req, res) => {
  try {
    const inquiry = await InquiryService.addNote(
      req.params.inquiryId, 
      req.body, 
      req.user._id
    );

    res.json({
      success: true,
      message: 'Note added successfully',
      data: inquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Update a specific note
 */
exports.updateNote = async (req, res) => {
  try {
    const inquiry = await InquiryService.updateNote(
      req.params.inquiryId,
      req.params.noteId,
      req.body.message,
      req.user._id
    );

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry or note not found'
      });
    }

    res.json({
      success: true,
      message: 'Note updated successfully',
      data: inquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Reply to a specific note
 */
exports.replyToNote = async (req, res) => {
  try {
    const inquiry = await InquiryService.replyToNote(
      req.params.inquiryId,
      req.params.noteId,
      {
        message: req.body.message,
        role: req.body.role
      },
      req.user._id
    );

    res.json({
      success: true,
      message: 'Reply added successfully',
      data: inquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Update product status
 */
exports.updateProductStatus = async (req, res) => {
  try {
    const { productIndex, status } = req.body;
    
    const inquiry = await InquiryService.updateProductStatus(
      req.params.inquiryId,
      productIndex,
      status
    );

    res.json({
      success: true,
      message: 'Product status updated successfully',
      data: inquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Search inquiries (legacy support)
 */
exports.searchInquiry = async (req, res) => {
  try {
    const { search } = req.query;

    const filters = { search };
    const inquiriesData = await InquiryService.getInquiries(filters, 1, 50);

    res.json({
      success: true,
      data: inquiriesData.inquiries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getCompanyInquiries = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const companyId = req.query.companyId;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'Company ID is required'
            });
        }

        const filters = {
            companyId: companyId,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            status: req.query.status,
            search: req.query.search
        };

        const inquiriesData = await InquiryService.getInquiries(filters, page, limit);

        res.json({
            success: true,
            data: inquiriesData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
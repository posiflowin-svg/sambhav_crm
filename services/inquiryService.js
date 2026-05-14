const Inquiry = require('../models/Inquiry');
const Company = require('../models/Company');
const mongoose = require('mongoose');

class InquiryService {
  /**
   * Get inquiries with filters and pagination
   */
  async getInquiries(filters = {}, page = 1, limit = 15) {
    try {
      const query = this.buildQuery(filters);
      
      const skip = (page - 1) * limit;
      
      const [inquiries, total] = await Promise.all([
        Inquiry.find(query)
          .populate('companyId', 'companyName phoneNumber email')
          .populate('assignedChinaPerson', 'name email')
          .populate('assignedSalesPerson', 'name email')
          .populate('createdBy', 'name')
          .populate('notes.addedBy', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Inquiry.countDocuments(query)
      ]);

      return {
        inquiries,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw error;
    }
  }

  buildQuery(filters) {
    const query = {};

    // ⭐ COMPANY FILTER (IMPORTANT)
    if (filters.companyId) {
      query.companyId = new mongoose.Types.ObjectId(filters.companyId);
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) {
        query.createdAt.$gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Status filter
    if (filters.status && filters.status !== 'all') {
      query.overallStatus = filters.status;
    }

    // Search filter
    if (filters.search) {
      query.$or = [
        { 'products.productName': { $regex: filters.search, $options: 'i' } }
      ];
    }

    // Assigned to filters
    if (filters.assignedChina) {
      query.assignedChinaPerson = new mongoose.Types.ObjectId(filters.assignedChina);
    }

    if (filters.assignedSales) {
      query.createdBy = new mongoose.Types.ObjectId(filters.assignedSales);
    }

    return query;
  }

  /**
   * Get statistics for dashboard
   */
  async getStatistics(filters = {}) {
    try {
      const query = this.buildQuery(filters);

      const stats = await Inquiry.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalInquiries: { $sum: 1 },
            newInquiries: {
              $sum: { $cond: [{ $eq: ['$overallStatus', 'new'] }, 1, 0] }
            },
            chinaProcessing: {
              $sum: { $cond: [{ $eq: ['$overallStatus', 'china-processing'] }, 1, 0] }
            },
            pricingReady: {
              $sum: { $cond: [{ $eq: ['$overallStatus', 'pricing-ready'] }, 1, 0] }
            },
            salesProcessing: {
              $sum: { $cond: [{ $eq: ['$overallStatus', 'sales-processing'] }, 1, 0] }
            },
            completed: {
              $sum: { $cond: [{ $eq: ['$overallStatus', 'completed'] }, 1, 0] }
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ['$overallStatus', 'cancelled'] }, 1, 0] }
            }
          }
        }
      ]);

      return stats[0] || {
        totalInquiries: 0,
        newInquiries: 0,
        chinaProcessing: 0,
        pricingReady: 0,
        salesProcessing: 0,
        completed: 0,
        cancelled: 0
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get single inquiry by ID
   */
  async getInquiryById(inquiryId) {
    return await Inquiry.findById(inquiryId)
      .populate('companyId')
      .populate('assignedChinaPerson', 'name email')
      .populate('assignedSalesPerson', 'name email')
      .populate('createdBy', 'name')
      .populate('notes.addedBy', 'name');
  }

  /**
   * Create new inquiry
   */
  async createInquiry(data, userId) {
    const inquiry = await Inquiry.create({
      ...data,
      assignedSalesPerson: userId,
      createdBy: userId
    });
    return inquiry;
  }

  /**
   * Update inquiry
   */
  async updateInquiry(inquiryId, data) {
    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) throw new Error('Inquiry not found');

    // Handle notes separately - append instead of replace
    if (data.notes && Array.isArray(data.notes) && data.notes.length > 0) {
      // Add new notes to existing ones
      data.notes.forEach(note => {
        inquiry.notes.push({
          message: note.message,
          role: note.role,
          addedBy: note.addedBy || data.userId, // Use provided userId or from data
          parentNoteId: note.parentNoteId || null,
          createdAt: new Date()
        });
      });
      
      // Remove notes from data to prevent overwriting
      delete data.notes;
    }

    // Update other fields
    Object.assign(inquiry, data);
    inquiry.updatedAt = Date.now();

    await inquiry.save();
    
    return await Inquiry.findById(inquiryId)
      .populate('notes.addedBy', 'name')
      .populate('assignedChinaPerson', 'name email')
      .populate('assignedSalesPerson', 'name email');
  }

  /**
   * Delete inquiry
   */
  async deleteInquiry(inquiryId) {
    return await Inquiry.findByIdAndDelete(inquiryId);
  }

  /**
   * Add note to inquiry
   */
  async addNote(inquiryId, noteData, userId) {
    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) throw new Error('Inquiry not found');

    // Push new note to existing notes array
    inquiry.notes.push({
      message: noteData.message,
      role: noteData.role,
      addedBy: userId,
      parentNoteId: noteData.parentNoteId || null,
      createdAt: new Date()
    });

    // Update overall status if provided
    if (noteData.overallStatus) {
      inquiry.overallStatus = noteData.overallStatus;
    }

    inquiry.updatedAt = Date.now();
    await inquiry.save();
    
    return await Inquiry.findById(inquiryId)
      .populate('notes.addedBy', 'name')
      .populate('assignedChinaPerson', 'name email')
      .populate('assignedSalesPerson', 'name email');
  }

  /**
   * Update a specific note
   */
  async updateNote(inquiryId, noteId, newMessage, userId) {
    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) throw new Error('Inquiry not found');

    // Find the note
    const note = inquiry.notes.id(noteId);
    if (!note) throw new Error('Note not found');

    // Check if user has permission to edit (optional)
    if (note.addedBy.toString() !== userId.toString()) {
      // You might want to allow admins to edit any note
      const user = await User.findById(userId);
      if (user.role !== 'admin') {
        throw new Error('You can only edit your own notes');
      }
    }

    // Update note
    note.message = newMessage;
    note.isEdited = true;
    note.editedAt = new Date();

    await inquiry.save();
    
    return await Inquiry.findById(inquiryId)
      .populate('notes.addedBy', 'name');
  }

  /**
   * Reply to a specific note
   */
  async replyToNote(inquiryId, parentNoteId, noteData, userId) {
    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) throw new Error('Inquiry not found');

    // Verify parent note exists
    const parentNote = inquiry.notes.id(parentNoteId);
    if (!parentNote) throw new Error('Parent note not found');

    // Add reply note with reference to parent
    inquiry.notes.push({
      message: noteData.message,
      role: noteData.role,
      addedBy: userId,
      parentNoteId: parentNoteId,
      createdAt: new Date()
    });

    await inquiry.save();
    
    return await Inquiry.findById(inquiryId)
      .populate('notes.addedBy', 'name');
  }

  /**
   * Update product status
   */
  async updateProductStatus(inquiryId, productIndex, status) {
    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) throw new Error('Inquiry not found');

    if (inquiry.products[productIndex]) {
      inquiry.products[productIndex].status = status;
      await inquiry.save();
    }

    return inquiry;
  }
}

module.exports = new InquiryService();
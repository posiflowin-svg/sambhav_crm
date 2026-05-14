const Company = require('../models/Company');
const mongoose = require('mongoose');
const Inquiry = require('../models/Inquiry');

// @desc    Create a new company
// @route   POST /api/companies
exports.createCompany = async (req, res) => {
  try {
    const { companyName, phoneNumber, location } = req.body;
    const salesPersonId = req.user._id; // Now correctly gets _id from user object

    // Check if company already exists
    const existingCompany = await Company.findOne({
      $or: [
        { companyName: { $regex: new RegExp('^' + companyName + '$', 'i') } },
        { phoneNumber }
      ]
    });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: 'Company with this name or phone number already exists',
        existingCompany
      });
    }

    const company = await Company.create({
      companyName,
      phoneNumber,
      salesPersonId,
      location: location || ''
    });

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      data: company
    });
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all companies with search, filters, and pagination
// @route   GET /api/companies
exports.getCompanies = async (req, res) => {
    try {
        const { 
            search, 
            page = 1, 
            limit = 20, 
            dateFilter, 
            dateFrom, 
            dateTo, 
            statuses,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        const salesPersonId = req.user._id;
        
        // Build query
        let query = { salesPersonId };
        
        // Apply search filter
        if (search && search.trim()) {
            query.$or = [
                { companyName: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Apply date filters
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        switch(dateFilter) {
            case 'today':
                query.createdAt = { $gte: today };
                break;
            case 'yesterday': {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                query.createdAt = {
                    $gte: yesterday,
                    $lt: today
                };
                break;
            }
            case 'thisWeek': {
                const thisWeekStart = new Date(today);
                thisWeekStart.setDate(today.getDate() - today.getDay());
                query.createdAt = { $gte: thisWeekStart };
                break;
            }
            case 'thisMonth': {
                const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                query.createdAt = { $gte: thisMonthStart };
                break;
            }
            case 'thisYear': {
                const thisYearStart = new Date(today.getFullYear(), 0, 1);
                query.createdAt = { $gte: thisYearStart };
                break;
            }
            case 'custom':
                if (dateFrom && dateTo) {
                    const fromDate = new Date(dateFrom);
                    fromDate.setHours(0, 0, 0, 0);
                    const toDate = new Date(dateTo);
                    toDate.setHours(23, 59, 59, 999);
                    query.createdAt = {
                        $gte: fromDate,
                        $lte: toDate
                    };
                }
                break;
        }
        
        // Apply status filters
        if (statuses) {
            const statusArray = statuses.split(',');
            if (statusArray.length > 0) {
                query.status = { $in: statusArray };
            }
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortDirection = sortOrder === 'desc' ? -1 : 1;
        
        // Get total count and companies
        const [totalCount, companies] = await Promise.all([
            Company.countDocuments(query),
            Company.find(query)
                .sort({ [sortBy]: sortDirection })
                .skip(skip)
                .limit(parseInt(limit))
                .lean() // Use lean() for better performance
        ]);
        
        // Get inquiry counts for all companies
        const companyIds = companies.map(company => company._id);
        
        let inquiryCounts = {};
        if (companyIds.length > 0) {
            const counts = await Inquiry.aggregate([
                {
                    $match: {
                        companyId: { $in: companyIds }
                    }
                },
                {
                    $group: {
                        _id: '$companyId',
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            // Create a map of companyId -> count
            counts.forEach(item => {
                inquiryCounts[item._id.toString()] = item.count;
            });
        }
        
        // Add inquiryCount to each company
        const companiesWithCount = companies.map(company => ({
            ...company,
            inquiryCount: inquiryCounts[company._id.toString()] || 0
        }));
        
        res.json({
            success: true,
            data: companiesWithCount,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                pages: Math.ceil(totalCount / parseInt(limit)),
                limit: parseInt(limit),
                hasNext: parseInt(page) * parseInt(limit) < totalCount,
                hasPrev: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('Get companies error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

// Helper function to get companies with inquiry count using optimized aggregation
async function getCompaniesWithInquiryCount(matchStage, page, limit, sortBy, sortOrder) {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    
    // Build sort object
    const sortStage = {};
    sortStage[sortBy] = sortDirection;
    
    // Use MongoDB aggregation pipeline for maximum efficiency
    return await Company.aggregate([
        { $match: matchStage },
        {
            $lookup: {
                from: 'inquiries',
                let: { companyId: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ['$companyId', '$$companyId'] }
                        }
                    },
                    { $count: 'count' }
                ],
                as: 'inquiryStats'
            }
        },
        {
            $addFields: {
                inquiryCount: {
                    $ifNull: [
                        { $arrayElemAt: ['$inquiryStats.count', 0] },
                        0
                    ]
                }
            }
        },
        { $sort: sortStage },
        { $skip: skip },
        { $limit: parseInt(limit) },
        {
            $project: {
                inquiryStats: 0, // Remove temporary field
                __v: 0 // Remove version if not needed
            }
        }
    ]);
}

// Helper function for date filters
function applyDateFilters(matchStage, dateFilter, dateFrom, dateTo) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch(dateFilter) {
        case 'today':
            matchStage.createdAt = { $gte: today };
            break;
        case 'yesterday': {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            matchStage.createdAt = {
                $gte: yesterday,
                $lt: today
            };
            break;
        }
        case 'thisWeek': {
            const thisWeekStart = new Date(today);
            thisWeekStart.setDate(today.getDate() - today.getDay());
            matchStage.createdAt = { $gte: thisWeekStart };
            break;
        }
        case 'thisMonth': {
            const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            matchStage.createdAt = { $gte: thisMonthStart };
            break;
        }
        case 'thisYear': {
            const thisYearStart = new Date(today.getFullYear(), 0, 1);
            matchStage.createdAt = { $gte: thisYearStart };
            break;
        }
        case 'custom':
            if (dateFrom && dateTo) {
                const fromDate = new Date(dateFrom);
                fromDate.setHours(0, 0, 0, 0);
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                matchStage.createdAt = {
                    $gte: fromDate,
                    $lte: toDate
                };
            }
            break;
    }
}

// @desc    Get single company
// @route   GET /api/companies/:id
exports.getCompany = async (req, res) => {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      salesPersonId: req.user._id
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.json({
      success: true,
      data: company
    });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update company
// @route   PUT /api/companies/:id
exports.updateCompany = async (req, res) => {
  try {
    const { companyName, phoneNumber, location, status, notes } = req.body;

    // Check for duplicate if name or phone is being changed
    if (companyName || phoneNumber) {
      const duplicateQuery = {
        _id: { $ne: req.params.id },
        salesPersonId: req.user._id,
        $or: []
      };

      if (companyName) {
        duplicateQuery.$or.push({ 
          companyName: { $regex: new RegExp('^' + companyName + '$', 'i') } 
        });
      }
      if (phoneNumber) {
        duplicateQuery.$or.push({ phoneNumber });
      }

      if (duplicateQuery.$or.length > 0) {
        const existing = await Company.findOne(duplicateQuery);
        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'Company with this name or phone already exists'
          });
        }
      }
    }

    const company = await Company.findOneAndUpdate(
      { _id: req.params.id, salesPersonId: req.user._id },
      {
        ...(companyName && { companyName }),
        ...(phoneNumber && { phoneNumber }),
        ...(location !== undefined && { location }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.json({
      success: true,
      message: 'Company updated successfully',
      data: company
    });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete company
// @route   DELETE /api/companies/:id
exports.deleteCompany = async (req, res) => {
  try {
    const company = await Company.findOneAndDelete({
      _id: req.params.id,
      salesPersonId: req.user._id
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.json({
      success: true,
      message: 'Company deleted successfully'
    });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Check if company exists
// @route   GET /api/companies/check
exports.checkCompany = async (req, res) => {
  try {
    const { name, phone } = req.query;
    const salesPersonId = req.user._id;

    let query = { salesPersonId };
    
    if (name) {
      query.companyName = { $regex: new RegExp('^' + name + '$', 'i') };
    }
    if (phone) {
      query.phoneNumber = phone;
    }

    const existingCompany = await Company.findOne(query);

    res.json({
      success: true,
      exists: !!existingCompany,
      company: existingCompany
    });
  } catch (error) {
    console.error('Check company error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get dashboard stats
// @route   GET /api/companies/stats
exports.getStats = async (req, res) => {
    try {
        const salesPersonId = req.user._id;
        
        const companies = await Company.find({ salesPersonId });
        
        const stats = {
            totalCompanies: companies.length,
            newCompanies: companies.filter(c => c.status === 'new').length,
            contacted: companies.filter(c => c.status === 'contacted').length,
            interested: companies.filter(c => c.status === 'interested').length,
            notInterested: companies.filter(c => c.status === 'not-interested').length,
            followUp: companies.filter(c => c.status === 'follow-up').length
        };
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error in getStats:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get company info page with inquiries
 */
exports.getCompanyInfo = async (req, res) => {
    try {
        const company = await Company.findById(req.params.companyId).lean();
        
        if (!company) {
            return res.status(404).render('error', { 
                message: 'Company not found',
                user: req.user,
                title: 'Error'
            });
        }

        // Get basic stats for this company
        const inquiryStats = await Inquiry.aggregate([
            { $match: { companyId: company._id } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    new: { $sum: { $cond: [{ $eq: ['$overallStatus', 'new'] }, 1, 0] } },
                    processing: { 
                        $sum: { 
                            $cond: [{ 
                                $in: ['$overallStatus', ['china-processing', 'pricing-ready', 'sales-processing']] 
                            }, 1, 0] 
                        } 
                    },
                    completed: { $sum: { $cond: [{ $eq: ['$overallStatus', 'completed'] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $eq: ['$overallStatus', 'cancelled'] }, 1, 0] } }
                }
            }
        ]);

        res.render('sales/info', {
            title: `${company.companyName} - Company Details`,
            user: req.user,
            company: company,
            stats: inquiryStats[0] || { total: 0, new: 0, processing: 0, completed: 0, cancelled: 0 },
            currentPage: 'companies'
        });
    } catch (error) {
        console.error('Error loading company info:', error);
        res.status(500).render('error', { 
            message: 'Error loading company information',
            user: req.user,
            title: 'Error'
        });
    }
};
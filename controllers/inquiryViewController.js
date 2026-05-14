const InquiryService = require('../services/inquiryService');
const Company = require('../models/Company');
const User = require('../models/User');

/**
 * Render inquiry dashboard
 */
exports.renderDashboard = async (req, res) => {
  try {
    // Get users for assignment filters
    const [chinaUsers, salesUsers] = await Promise.all([
      User.find({ role: 'china' }).select('name').lean(),
      User.find({ role: 'sales' }).select('name').lean()
    ]);

    res.render('inquiries/dashboard', {
      title: 'Inquiry Management',
      user: req.user,
      chinaUsers,
      salesUsers,
      currentPage: 'inquiries'
    });
  } catch (error) {
    console.error('Error rendering dashboard:', error);
    res.status(500).render('error', { message: 'Error loading dashboard' });
  }
};

/**
 * Render create inquiry form
 */
exports.renderCreateForm = async (req, res) => {
  try {
    const [companies, chinaUsers, salesUsers] = await Promise.all([
      Company.find().select('companyName phoneNumber').lean(),
      User.find({ role: 'china' }).select('name email').lean(),
      User.find({ role: 'sales' }).select('name email').lean()
    ]);

    res.render('inquiries/create', {
      title: 'Create New Inquiry',
      user: req.user,
      companies,
      chinaUsers,
      salesUsers,
      currentPage: 'inquiries'
    });
  } catch (error) {
    console.error('Error rendering create form:', error);
    res.status(500).render('error', { message: 'Error loading form' });
  }
};

/**
 * Render edit inquiry form
 */
exports.renderEditForm = async (req, res) => {
  try {
    const [inquiry, companies, chinaUsers, salesUsers] = await Promise.all([
      InquiryService.getInquiryById(req.params.inquiryId),
      Company.find().select('companyName phoneNumber').lean(),
      User.find({ role: 'china' }).select('name email').lean(),
      User.find({ role: 'sales' }).select('name email').lean()
    ]);

    if (!inquiry) {
      return res.status(404).render('error', { message: 'Inquiry not found' });
    }

    res.render('inquiries/edit', {
      title: 'Edit Inquiry',
      user: req.user,
      inquiry,
      companies,
      chinaUsers,
      salesUsers,
      currentPage: 'inquiries'
    });
  } catch (error) {
    console.error('Error rendering edit form:', error);
    res.status(500).render('error', { message: 'Error loading form' });
  }
};

/**
 * Render inquiry details
 */
exports.renderDetails = async (req, res) => {
  try {
    const inquiry = await InquiryService.getInquiryById(req.params.inquiryId);

    if (!inquiry) {
      return res.status(404).render('error', { message: 'Inquiry not found' });
    }

    res.render('inquiries/details', {
      title: 'Inquiry Details',
      user: req.user,
      inquiry,
      currentPage: 'inquiries'
    });
  } catch (error) {
    console.error('Error rendering details:', error);
    res.status(500).render('error', { message: 'Error loading details' });
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
                user: req.user 
            });
        }

        res.render('companies/info', {
            title: `${company.companyName} - Company Details`,
            user: req.user,
            company: company,
            currentPage: 'companies'
        });
    } catch (error) {
        console.error('Error loading company info:', error);
        res.status(500).render('error', { 
            message: 'Error loading company information',
            user: req.user 
        });
    }
};
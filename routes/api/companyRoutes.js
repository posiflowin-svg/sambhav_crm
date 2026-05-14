const express = require('express');
const router = express.Router();
const {
  createCompany,
  getCompanies,
  getCompany,
  updateCompany,
  deleteCompany,
  checkCompany,
  getStats
} = require('../../controllers/companyController');

const authController = require('../../middleware/authMiddleware');
// All routes are protected
router.use(authController.protect);

// Company routes
router.route('/')
  .get(getCompanies)
  .post(createCompany);

router.get('/stats', getStats);
router.get('/check', checkCompany);

router.route('/:id')
  .get(getCompany)
  .put(updateCompany)
  .delete(deleteCompany);

module.exports = router;
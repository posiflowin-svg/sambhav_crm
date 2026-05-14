// validators/productValidator.js
const { body } = require('express-validator');

exports.validateProduct = [
  body('name').notEmpty().withMessage('Name is required'),
  body('price')
    .notEmpty().withMessage('Price is required')
    .isNumeric().withMessage('Price must be a number')
    .isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('sku').optional().isString(),
];
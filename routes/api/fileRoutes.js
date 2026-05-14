const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../../controllers/fileController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// PDF upload config (for shipping labels)
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || 
        file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'), false);
    }
  }
});


router.post(
  '/orders/:orderId/pi-document',
  pdfUpload.single('piDocument'),
  fileController.uploadPIDocument
);

router.get('/files/:filename', fileController.getFile);

module.exports = router;
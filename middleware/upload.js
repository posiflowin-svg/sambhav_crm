// middleware/upload.js
const multer = require('multer');

// PI Document upload configuration
const piUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for PI documents
  },
  fileFilter: (req, file, cb) => {
    // Allow PDF, Word documents, and images for PI documents
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and images are allowed for PI documents'), false);
    }
  }
});

module.exports = piUpload;
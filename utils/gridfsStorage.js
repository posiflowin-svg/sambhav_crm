const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

class GridFSStorageManager {
  constructor() {
    this.connection = null;
    this.initializeConnection();
  }

  initializeConnection() {
    this.connection = mongoose.createConnection(process.env.MONGO_URL, {
      maxPoolSize: 10,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    this.connection.on('error', (err) => {
      console.error('GridFS connection error:', err);
      // Consider adding reconnect logic here
    });

    this.connection.once('open', () => {
      console.log('GridFS connection established');
    });
  }

  createStorage(bucketName) {
    return new GridFsStorage({
      db: this.connection, // Removed Promise.resolve()
      file: (req, file) => {
        return new Promise((resolve, reject) => {
          crypto.randomBytes(16, (err, buf) => {
            if (err) return reject(err);
            
            const fileInfo = {
              filename: buf.toString('hex') + path.extname(file.originalname),
              bucketName: bucketName,
              metadata: {
                orderId: req.params.orderId,
                originalName: file.originalname,
                uploadDate: new Date(),
                contentType: file.mimetype,
                // Removed userId since you're not using auth currently
              }
            };
            
            // Validate required fields
            if (!fileInfo.filename || !fileInfo.bucketName) {
              return reject(new Error('Missing required file information'));
            }
            
            resolve(fileInfo);
          });
        });
      }
    });
  }

  createUploadMiddleware(storage, options) {
    const upload = multer({
      storage,
      limits: options.limits,
      fileFilter: options.fileFilter
    })[options.method](options.fieldName, options.maxCount);

    return (req, res, next) => {
      if (this.connection.readyState !== 1) {
        return res.status(503).json({
          error: 'File storage service unavailable',
          details: 'Database connection not ready'
        });
      }

      upload(req, res, (err) => {
        if (err) {
          return this.handleUploadError(err, res, options);
        }

        if ((!req.files || req.files.length === 0) && !req.file) {
          return res.status(400).json({ error: 'No files were uploaded' });
        }

        next();
      });
    };
  }

  handleUploadError(err, res, options) {
    const errorMap = {
      LIMIT_FILE_SIZE: {
        status: 413,
        message: `File too large. Maximum size allowed is ${options.limits.fileSize / (1024 * 1024)}MB`
      },
      LIMIT_FILE_COUNT: {
        status: 413,
        message: `Too many files. Maximum ${options.maxCount} files allowed`
      },
      default: {
        status: 500,
        message: 'File upload failed'
      }
    };

    const errorType = err.code || 'default';
    const errorResponse = errorMap[errorType] || errorMap.default;
    
    if (err.message.includes('Only images are allowed') || 
        err.message.includes('Only PDFs are allowed')) {
      errorResponse.status = 400;
      errorResponse.message = err.message;
    }

    return res.status(errorResponse.status).json({
      error: errorResponse.message,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  getConnection() {
    return this.connection;
  }
}

// Initialize the manager
const storageManager = new GridFSStorageManager();

// Export configured middlewares
module.exports = {
  uploadMultiplePaymentProofs: storageManager.createUploadMiddleware(
    storageManager.createStorage('paymentProofs'),
    {
      method: 'array',
      fieldName: 'paymentProofs',
      maxCount: 5,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only images are allowed for payment proof'), false);
        }
        cb(null, true);
      }
    }
  ),

  uploadSingleShippingLabel: storageManager.createUploadMiddleware(
    storageManager.createStorage('shippingLabels'),
    {
      method: 'single',
      fieldName: 'shippingLabel',
      maxCount: 1,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new Error('Only PDFs are allowed for shipping labels'), false);
        }
        cb(null, true);
      }
    }
  ),

  getGridFsConnection: () => storageManager.getConnection()
};
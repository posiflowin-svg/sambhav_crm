// controllers/fileController.js
const FileService = require('../utils/fileService');
const Order = require('../models/Order');

class FileController {
  async uploadPIDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { orderId } = req.params;

      // Find the order
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Delete existing PI document if it exists
      if (order.piDocument && order.piDocument.original) {
        await FileService.deleteFile('piDocuments', order.piDocument.original);
      }

      // Upload new PI document
      const uploadResult = await FileService.uploadFile(
        'piDocuments',
        req.file.buffer,
        req.file.originalname,
        {
          orderId: orderId,
          contentType: req.file.mimetype,
          documentType: 'pi'
        }
      );

      const storedFile = {
        filename: uploadResult.filename,
        id: uploadResult.id,
        url: `/api/file/files/${uploadResult.filename}?bucket=piDocuments`,
        uploadedAt: new Date(),
        originalName: uploadResult.metadata.originalName || uploadResult.filename
      };

      // Update order with PI document
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { 
          piDocument: {
            original: storedFile.filename,
            updated: null
          }
        },
        { new: true }
      ).populate('customer', 'name mobileNumber billingAddress')
       .populate('salesPerson', 'name email');

      res.json({
        message: 'PI document uploaded successfully',
        file: storedFile,
        order: updatedOrder
      });
    } catch (error) {
      console.error('PI document upload error:', error);
      res.status(500).json({ 
        error: 'Failed to upload PI document',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async getFile(req, res) {
    try {
      const bucketName = req.query.bucket || 'piDocuments';
      const file = await FileService.getFile(bucketName, req.params.filename);
      
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.set('Content-Type', file.metadata.contentType);
      const downloadStream = FileService.buckets[bucketName].openDownloadStreamByName(req.params.filename);
      downloadStream.pipe(res);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve file' });
    }
  }

  async deleteFile(req, res) {
    try {
      const { filename } = req.params;
      const bucketName = req.query.bucket || 'piDocuments';

      // Check if file is being used in any order before deletion
      const orderUsingFile = await Order.findOne({
        $or: [
          { 'piDocument.original': filename },
          { 'piDocument.updated': filename }
        ]
      });

      if (orderUsingFile) {
        return res.status(400).json({ 
          error: 'Cannot delete file. It is currently being used in an order.' 
        });
      }

      await FileService.deleteFile(bucketName, filename);

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('File deletion error:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  }
}

module.exports = new FileController();
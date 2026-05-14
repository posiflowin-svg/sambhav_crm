const { MongoClient, GridFSBucket } = require('mongodb');
const mongoose = require('mongoose');
require('dotenv').config();

class FileService {
  constructor() {
    this.client = new MongoClient(process.env.MONGO_URL);
    this.buckets = {};
  }

  async connect() {
    await this.client.connect();
    const db = this.client.db();
    
    this.buckets.paymentProofs = new GridFSBucket(db, { bucketName: 'paymentProofs' });
    this.buckets.shippingLabels = new GridFSBucket(db, { bucketName: 'shippingLabels' });
    this.buckets.boxPhotos = new GridFSBucket(db, { bucketName: 'boxPhotos' });
    this.buckets.piDocuments = new GridFSBucket(db, { bucketName: 'piDocuments' }); // Added PI documents bucket
    
    console.log('Connected to MongoDB and initialized GridFS buckets');
  }

  async uploadFile(bucketName, fileBuffer, filename, metadata = {}) {
    return new Promise((resolve, reject) => {
      const uploadStream = this.buckets[bucketName].openUploadStream(filename, {
        metadata: {
          ...metadata,
          contentType: metadata.contentType,
          uploadDate: new Date()
        }
      });
      
      uploadStream.write(fileBuffer);
      uploadStream.end(() => {
        resolve({
          filename: uploadStream.filename,
          id: uploadStream.id,
          metadata: uploadStream.options.metadata
        });
      });
      
      uploadStream.on('error', reject);
    });
  }

  async getFile(bucketName, filename) {
    const files = await this.buckets[bucketName].find({ filename }).toArray();
    return files[0];
  }

  async deleteFile(bucketName, filename) {
    const file = await this.getFile(bucketName, filename);
    if (!file) return false;
    
    await this.buckets[bucketName].delete(file._id);
    return true;
  }
}

module.exports = new FileService();
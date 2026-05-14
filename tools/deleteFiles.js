const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
require('dotenv').config();

// Connect to MongoDB
// mongoose.connect(process.env.MONGO_URL, {});

const conn = mongoose.connection;

conn.once('open', async () => {
  try {
    const bucket = new GridFSBucket(conn.db, {
      bucketName: 'paymentProofs'
    });

    // Fetch all files in the bucket
    const files = await conn.db.collection('paymentProofs.files').find().toArray();

    if (!files || files.length === 0) {
      console.log('ℹ️ No files found in paymentProofs bucket.');
      mongoose.connection.close();
      return;
    }

    // Delete each file by _id
    for (const file of files) {
      await bucket.delete(file._id);
      console.log(`🗑️ Deleted file: ${file.filename}`);
    }

    console.log(`✅ Deleted ${files.length} files from paymentProofs bucket.`);
  } catch (error) {
    console.error('❌ Error deleting files:', error);
  } finally {
    mongoose.connection.close();
  }
});

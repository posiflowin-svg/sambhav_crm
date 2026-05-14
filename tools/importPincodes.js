// tools/importPincodes.js
require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const PincodeServiceability = require('../models/PincodeServiceability');
const path = require('path');

async function importPincodesFromExcel(filePath) {
  let workbook;
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB...');

    // Read Excel file with exceljs
    console.log('Reading Excel file with exceljs...');
    workbook = new ExcelJS.Workbook();
    
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.worksheets[0];
    const rowCount = worksheet.rowCount;
    
    console.log(`Found ${rowCount - 1} rows in Excel file (including header)`);

    const pincodes = [];
    let skippedRows = 0;
    let duplicatePincodes = 0;

    // Get header row to map columns
    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values;
    
    console.log('Headers found:', headers);

    // Find column indices
    const pincodeCol = headers.findIndex(h => 
      h && h.toString().toLowerCase().includes('pincode')
    );
    const stateCodeCol = headers.findIndex(h => 
      h && h.toString().toLowerCase().includes('state')
    );
    const regionCol = headers.findIndex(h => 
      h && h.toString().toLowerCase().includes('region')
    );
    const serviceTypeCol = headers.findIndex(h => 
      h && h.toString().toLowerCase().includes('service')
    );
    const controllingCodeCol = headers.findIndex(h => 
      h && h.toString().toLowerCase().includes('control')
    );
    const cityNameCol = headers.findIndex(h => 
      h && h.toString().toLowerCase().includes('city')
    );

    console.log('Column mapping:', {
      pincodeCol,
      stateCodeCol,
      regionCol,
      serviceTypeCol,
      controllingCodeCol,
      cityNameCol
    });

    // Process rows with progress indicator
    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet.getRow(i);
      
      // Show progress every 1000 rows
      if (i % 1000 === 0) {
        console.log(`Processed ${i - 1} rows...`);
      }

      const pincodeNo = row.getCell(pincodeCol).value;
      
      // Skip empty pincodes
      if (!pincodeNo) {
        skippedRows++;
        continue;
      }

      const pincodeData = {
        pincode: pincodeNo.toString().trim(),
        stateCode: (row.getCell(stateCodeCol).value || '').toString().trim(),
        region: (row.getCell(regionCol).value || '').toString().trim(),
        serviceType: (row.getCell(serviceTypeCol).value || 'SERVICEABLE').toString().trim().toUpperCase(),
        controllingCode: (row.getCell(controllingCodeCol).value || '').toString().trim(),
        controllingCityName: (row.getCell(cityNameCol).value || '').toString().trim(),
        isActive: true
      };

      // Validate serviceType - ONLY import SERVICEABLE pincodes
      if (pincodeData.serviceType !== 'SERVICEABLE') {
        console.log(`⚠️  Skipping non-serviceable pincode: ${pincodeData.pincode} - ${pincodeData.serviceType}`);
        skippedRows++;
        continue;
      }

      pincodes.push(pincodeData);
    }

    console.log(`\n📊 Processing summary:`);
    console.log(`   Total rows in file: ${rowCount - 1}`);
    console.log(`   Valid SERVICEABLE pincodes found: ${pincodes.length}`);
    console.log(`   Skipped rows: ${skippedRows}`);

    if (pincodes.length === 0) {
      console.log('❌ No valid SERVICEABLE pincodes found to import');
      return;
    }

    // ✅ IMPORTANT: Clear existing data before fresh import
    console.log('🗑️  Clearing existing pincode data...');
    const deleteResult = await PincodeServiceability.deleteMany({});
    console.log(`   Removed ${deleteResult.deletedCount} existing records`);

    // Batch insert for better performance
    console.log('Inserting pincodes into database...');
    const batchSize = 1000;
    let successfulImports = 0;
    
    for (let i = 0; i < pincodes.length; i += batchSize) {
      const batch = pincodes.slice(i, i + batchSize);
      
      try {
        const result = await PincodeServiceability.insertMany(batch, {
          ordered: false, // Continue on duplicate errors
        });
        
        successfulImports += result.length;
        console.log(`   Batch ${Math.floor(i/batchSize) + 1} completed: ${result.length} pincodes`);
        
      } catch (batchError) {
        if (batchError.writeErrors) {
          const duplicatesInBatch = batchError.writeErrors.length;
          duplicatePincodes += duplicatesInBatch;
          successfulImports += (batch.length - duplicatesInBatch);
          console.log(`   Batch ${Math.floor(i/batchSize) + 1}: ${batch.length - duplicatesInBatch} inserted, ${duplicatesInBatch} duplicates skipped`);
        } else {
          console.error(`   Batch ${Math.floor(i/batchSize) + 1} error:`, batchError.message);
        }
      }
    }

    console.log('\n✅ Import completed successfully!');
    console.log(`📊 Final summary:`);
    console.log(`   ✅ Successfully imported: ${successfulImports} SERVICEABLE pincodes`);
    console.log(`   🔄 Duplicates skipped: ${duplicatePincodes}`);
    console.log(`   ❌ Empty/Non-serviceable rows skipped: ${skippedRows}`);
    
    // Display sample data
    console.log('\n📋 Sample of imported pincodes:');
    const samplePincodes = await PincodeServiceability.find().limit(10).sort({ pincode: 1 });
    samplePincodes.forEach(p => {
      console.log(`   ${p.pincode} - ${p.controllingCityName} - ${p.serviceType}`);
    });

    // Verify total count
    const totalCount = await PincodeServiceability.countDocuments();
    console.log(`\n📈 Total pincodes in database: ${totalCount}`);

    // Count by service type (should all be SERVICEABLE)
    const serviceCounts = await PincodeServiceability.aggregate([
      {
        $group: {
          _id: '$serviceType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('\n🏷️ Service type breakdown:');
    serviceCounts.forEach(st => {
      console.log(`   ${st._id}: ${st.count} pincodes`);
    });

    // Test specific pincodes
    console.log('\n🧪 Testing specific pincodes:');
    const testPincodes = ['625579', '110001', '110002'];
    for (const testPincode of testPincodes) {
      const exists = await PincodeServiceability.findOne({ pincode: testPincode });
      console.log(`   ${testPincode}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    }

  } catch (error) {
    console.error('❌ Error importing pincodes:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error('   File not found. Please check the file path.');
    }
  } finally {
    // Cleanup
    if (workbook) {
      workbook.worksheets = [];
    }
    
    // Close database connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('Database connection closed.');
    }
    
    process.exit(0);
  }
}

// Get file path from command line or use default
const filePath = process.argv[2] || path.join(__dirname, 'pincodes.xlsx');

// Check if file exists
const fs = require('fs');
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  console.log('\n💡 Usage:');
  console.log('   npm run import-pincodes');
  console.log('   OR');
  console.log('   node tools/importPincodes.js /path/to/your/pincodes.xlsx');
  process.exit(1);
}

// Run the import
console.log(`📁 Using file: ${filePath}`);
importPincodesFromExcel(filePath);
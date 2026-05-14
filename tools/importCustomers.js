// tools/importCustomers.js
require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Customer = require('../models/Customer');
const User = require('../models/User');
const path = require('path');

async function importCustomersFromExcel(filePath) {
  let workbook;
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/order_management');
    
    console.log('✅ Connected to MongoDB...');

    // Read Excel file with exceljs
    console.log('📖 Reading Excel file...');
    workbook = new ExcelJS.Workbook();
    
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.worksheets[0];
    const rowCount = worksheet.rowCount;
    
    console.log(`📊 Found ${rowCount - 1} rows in Excel file (including header)`);

    // Get admin user
    let adminUser;
    try {
      adminUser = await User.findOne({ 
        email: 'dhaval@gmail.com',
        role: 'admin' 
      });
      
      if (!adminUser) {
        // Fallback to any admin user
        adminUser = await User.findOne({ role: 'admin' });
      }
      
      if (!adminUser) {
        throw new Error('No admin user found. Please create an admin user first.');
      }
      
      console.log(`👤 Assigning customers to admin: ${adminUser.name} (${adminUser.email})`);
    } catch (error) {
      console.error('❌ Error finding admin user:', error.message);
      throw error;
    }

    // Process customer names
    const customerNames = new Set(); // Track unique names
    let skippedRows = 0;
    let duplicateInFile = 0;

    // Get header row to map columns
    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values;
    
    console.log('📋 Headers found:', headers);

    // Find column indices for customer names
    let customerNameCol = headers.findIndex(h => 
      h && (
        h.toString().toLowerCase().includes('party') || 
        h.toString().toLowerCase().includes('name') ||
        h.toString().toLowerCase().includes('customer')
      )
    );

    console.log('📍 Customer name column index:', customerNameCol);

    if (customerNameCol === -1) {
      console.log('ℹ️  No specific customer name column found. Using first column.');
      customerNameCol = 1;
    }

    // Process all rows
    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet.getRow(i);
      const customerName = row.getCell(customerNameCol).value;
      
      // Skip empty customer names
      if (!customerName) {
        skippedRows++;
        continue;
      }

      const cleanName = customerName.toString().trim();
      
      // Skip if name is empty after trimming
      if (!cleanName) {
        skippedRows++;
        continue;
      }

      // Skip duplicates within the same file
      if (customerNames.has(cleanName)) {
        duplicateInFile++;
        continue;
      }

      customerNames.add(cleanName);
    }

    const uniqueNames = Array.from(customerNames);
    
    console.log(`\n📊 File Processing Summary:`);
    console.log(`   Total rows in file: ${rowCount - 1}`);
    console.log(`   Unique customer names found: ${uniqueNames.length}`);
    console.log(`   Duplicates skipped in file: ${duplicateInFile}`);
    console.log(`   Empty rows skipped: ${skippedRows}`);

    if (uniqueNames.length === 0) {
      console.log('❌ No valid customer names found to import');
      return;
    }

    // DEBUG: Show first 10 names to verify
    console.log('\n🔍 First 10 customer names found:');
    uniqueNames.slice(0, 10).forEach((name, index) => {
      console.log(`   ${index + 1}. "${name}"`);
    });

    // Check for existing customers in database - use case-insensitive comparison
    const existingCustomers = await Customer.find({});
    const existingNames = existingCustomers.map(c => c.name.trim().toLowerCase());
    
    console.log(`\n📋 Existing customers in DB: ${existingNames.length}`);
    if (existingNames.length > 0) {
      console.log('   Existing customer names:');
      existingNames.forEach(name => {
        console.log(`     - "${name}"`);
      });
    }

    // Case-insensitive duplicate check
    const newNames = uniqueNames.filter(name => 
      !existingNames.includes(name.trim().toLowerCase())
    );

    console.log(`\n📋 Database Check:`);
    console.log(`   Existing customers in DB: ${existingNames.length}`);
    console.log(`   New customers to import: ${newNames.length}`);
    console.log(`   Duplicates to skip: ${uniqueNames.length - newNames.length}`);

    if (newNames.length === 0) {
      console.log('✅ All customers already exist in database. No new customers to import.');
      return;
    }

    // DEBUG: Show first 10 new names to import
    console.log('\n🔍 First 10 new customers to import:');
    newNames.slice(0, 10).forEach((name, index) => {
      console.log(`   ${index + 1}. "${name}"`);
    });

    // Create customer data (only name and assignedSalesPerson)
    const customersToCreate = newNames.map(name => ({
      name: name,
      assignedSalesPerson: adminUser._id,
      isActive: true
      // Other fields will be empty/default
    }));

    // Insert new customers one by one to see exact errors
    console.log('\n💾 Inserting new customers into database...');
    let successfulImports = 0;
    let failedImports = 0;
    
    for (let i = 0; i < customersToCreate.length; i++) {
      const customerData = customersToCreate[i];
      
      try {
        const customer = new Customer(customerData);
        await customer.save();
        successfulImports++;
        
        if (successfulImports % 50 === 0) {
          console.log(`   ✅ Imported ${successfulImports} customers...`);
        }
        
      } catch (error) {
        failedImports++;
        console.log(`   ❌ Failed to import "${customerData.name}": ${error.message}`);
        
        // Stop after 5 failures to avoid spam
        if (failedImports >= 5) {
          console.log('   ⚠️  Stopping error display after 5 failures...');
          break;
        }
      }
    }

    console.log('\n🎉 Import completed!');
    console.log(`📊 Final Summary:`);
    console.log(`   ✅ Successfully imported: ${successfulImports} customers`);
    console.log(`   ❌ Failed imports: ${failedImports}`);
    console.log(`   🔄 Duplicates skipped (in file): ${duplicateInFile}`);
    console.log(`   🔄 Duplicates skipped (in DB): ${uniqueNames.length - newNames.length}`);
    console.log(`   ❌ Empty rows skipped: ${skippedRows}`);
    
    // Display sample of imported customers
    if (successfulImports > 0) {
      console.log('\n📋 Sample of imported customers:');
      const sampleCustomers = await Customer.find({ 
        name: { $in: newNames.slice(0, 10) } 
      })
      .select('name assignedSalesPerson createdAt')
      .populate('assignedSalesPerson', 'name email')
      .sort({ name: 1 });
      
      sampleCustomers.forEach((c, index) => {
        console.log(`   ${index + 1}. ${c.name} - Assigned to: ${c.assignedSalesPerson.name}`);
      });

      if (newNames.length > 10) {
        console.log(`   ... and ${newNames.length - 10} more customers`);
      }
    }

    // Verify total count
    const totalCount = await Customer.countDocuments();
    console.log(`\n📈 Total customers in database: ${totalCount}`);

  } catch (error) {
    console.error('❌ Error importing customers:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error('   File not found. Please check the file path.');
    }
    
    if (error.message.includes('admin user')) {
      console.log('\n💡 Solution: Please make sure you have an admin user with email: dhaval@gmail.com');
      console.log('   Or update the script to use a different admin user.');
    }
  } finally {
    // Cleanup
    if (workbook) {
      workbook.worksheets = [];
    }
    
    // Close database connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('\n🔌 Database connection closed.');
    }
    
    process.exit(0);
  }
}

// Get file path from command line or use default
const filePath = process.argv[2] || path.join(__dirname, 'customers.xlsx');

// Check if file exists
const fs = require('fs');
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  console.log('\n💡 Usage:');
  console.log('   npm run import-customers');
  console.log('   OR');
  console.log('   node tools/importCustomers.js /path/to/your/customers.xlsx');
  process.exit(1);
}

// Run the import
console.log(`📁 Using file: ${filePath}`);
console.log('🚀 Starting customer import...\n');
importCustomersFromExcel(filePath);
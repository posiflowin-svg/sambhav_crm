// tools/importProducts.js
require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Product = require('../models/Product');
const path = require('path');
const fs = require('fs');

/**
 * Allowed categories exactly as defined in the Product schema
 */
const ALLOWED_CATEGORIES = new Set(['Components', 'Display', 'TFT Display', 'POS', 'Printer']);

/**
 * Normalise a raw category string to one of the allowed categories
 * @param {string} raw
 * @returns {string|null} - normalised category or null if invalid
 */
function normaliseCategory(raw) {
  if (!raw) return null;
  const trimmed = raw.toString().trim();
  // Case‑insensitive matching – you can extend this map if needed
  const lower = trimmed.toLowerCase();
  if (lower === 'components') return 'Components';
  if (lower === 'display') return 'Display';
  if (lower === 'tft display') return 'TFT Display';
  if (lower === 'pos') return 'POS';
  if (lower === 'printer') return 'Printer';
  return null; // not allowed
}

async function importProductsFromExcel(filePath) {
  let workbook;

  try {
    // Connect to MongoDB (modern driver)
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Load Excel workbook
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    const rowCount = worksheet.rowCount;
    console.log(`📄 Excel rows (including header): ${rowCount}`);

    // ---------- Read and map headers ----------
    const headerRow = worksheet.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value ? cell.value.toString().toLowerCase().trim() : '';
    });
    console.log('📌 Headers found:', headers);

    const itemNameCol = headers.findIndex(h => h && h.includes('item name'));
    const stockQtyCol = headers.findIndex(h => h && h.includes('stock'));
    const categoryCol = headers.findIndex(h => h && h.includes('cat'));   // matches "catagery"
    const locationCol = headers.findIndex(h => h && h.includes('location'));

    console.log('🧭 Column mapping:', {
      itemNameCol,
      stockQtyCol,
      categoryCol,
      locationCol
    });

    if (itemNameCol === -1 || stockQtyCol === -1 || categoryCol === -1 || locationCol === -1) {
      throw new Error('❌ One or more required columns not found in Excel');
    }

    // ---------- Process rows and build bulk operations ----------
    const operations = [];
    let skipped = 0;
    let processed = 0;
    const BATCH_SIZE = 500; // Number of operations per bulkWrite

    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet.getRow(i);

      // Extract cell values (may be null/undefined)
      const rawItemName = row.getCell(itemNameCol).value;
      const rawStock = row.getCell(stockQtyCol).value;
      const rawCategory = row.getCell(categoryCol).value;
      const rawLocation = row.getCell(locationCol).value;

      // Basic required field checks
      if (!rawItemName || !rawCategory || !rawLocation) {
        skipped++;
        continue;
      }

      // Generate itemCode (unique identifier)
      const itemCode = rawItemName.toString().trim().toUpperCase();
      const itemName = rawItemName.toString().trim(); // keep original case for display

      // Parse stock quantity – default to 0 if missing or invalid
      let stockQuantity = 0;
      if (rawStock !== null && rawStock !== undefined) {
        if (typeof rawStock === 'number') {
          stockQuantity = rawStock;
        } else {
          const parsed = parseFloat(rawStock.toString().replace(/[^0-9.-]/g, ''));
          if (!isNaN(parsed) && parsed >= 0) {
            stockQuantity = parsed;
          }
        }
      }

      // Validate and normalise category
      const category = normaliseCategory(rawCategory);
      if (!category) {
        console.log(`⚠️ Row ${i}: invalid category "${rawCategory}" – skipped`);
        skipped++;
        continue;
      }

      const location = rawLocation.toString().trim();

      // Prepare update data (only fields that should be set/overwritten)
      const updateData = {
        itemCode,
        itemName,
        category,
        location,
        stockQuantity,
        lastUpdated: new Date()
        // unit, minimumStock, maximumStock, etc. keep their existing values or defaults
      };

      // Create an upsert operation
      operations.push({
        updateOne: {
          filter: { itemCode },
          update: { $set: updateData },
          upsert: true
        }
      });

      processed++;

      // Execute in batches to avoid memory buildup
      if (operations.length >= BATCH_SIZE) {
        await executeBatch(operations);
        operations.length = 0; // clear the array
      }
    }

    // Execute any remaining operations
    if (operations.length > 0) {
      await executeBatch(operations);
    }

    console.log('\n📊 Summary');
    console.log(`   ✅ Rows processed: ${processed}`);
    console.log(`   ❌ Skipped rows:   ${skipped}`);

    // Optional: show a few sample products
    const sample = await Product.find().limit(5);
    console.log('\n📋 Sample products after import:');
    sample.forEach(p => console.log(`   ${p.itemCode} | stock: ${p.stockQuantity} | ${p.location} | ${p.category}`));

    const total = await Product.countDocuments();
    console.log(`\n📈 Total products now in DB: ${total}`);

  } catch (error) {
    console.error('❌ Import Error:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🔌 Database connection closed');
    }
    process.exit(0);
  }
}

/**
 * Execute a batch of upsert operations and log the result
 * @param {Array} ops - array of bulkWrite updateOne operations
 */
async function executeBatch(ops) {
  try {
    const result = await Product.bulkWrite(ops, { ordered: false });
    console.log(`   Batch inserted/updated: ` +
      `matched=${result.matchedCount}, ` +
      `modified=${result.modifiedCount}, ` +
      `upserted=${result.upsertedCount}`);
  } catch (error) {
    // bulkWrite may throw if some operations fail – we still want to see partial results
    console.error('   Batch error:', error.message);
    if (error.result) {
      const r = error.result;
      console.log(`   Partial results: matched=${r.matchedCount}, modified=${r.modifiedCount}, upserted=${r.upsertedCount}`);
    }
  }
}

// ---------- Entry point ----------
const filePath = process.argv[2] || path.join(__dirname, 'sam_products.xlsx');
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}
console.log(`📁 Using file: ${filePath}`);
importProductsFromExcel(filePath);
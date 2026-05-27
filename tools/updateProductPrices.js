// tools/updateProductPrices.js
require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Product = require('../models/Product');
const path = require('path');
const fs = require('fs');

/**
 * Update product prices from an Excel file.
 * Expected columns: "itemCode" (or "item code") and "price".
 * The script performs bulk upserts: if the itemCode exists, its price is updated;
 * if not, you can optionally skip or create a new product (default: skip).
 */
async function updatePricesFromExcel(filePath, options = {}) {
  const { createMissing = false } = options; // if true, creates new product with only itemCode & price
  let workbook;

  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    const rowCount = worksheet.rowCount;
    console.log(`📄 Excel rows (including header): ${rowCount}`);

    // Find header columns
    const headerRow = worksheet.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value ? cell.value.toString().toLowerCase().trim() : '';
    });

    const itemCodeCol = headers.findIndex(h => h && (h === 'itemcode' || h === 'item code'));
    const priceCol = headers.findIndex(h => h && (h === 'price' || h === 'unit price'));

    if (itemCodeCol === -1 || priceCol === -1) {
      throw new Error('❌ Required columns not found: "itemCode" and "price"');
    }

    console.log('🧭 Column mapping:', { itemCodeCol, priceCol });

    const operations = [];
    let processed = 0;
    let skipped = 0;
    let invalidPriceCount = 0;
    const BATCH_SIZE = 500;

    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet.getRow(i);
      const rawItemCode = row.getCell(itemCodeCol).value;
      const rawPrice = row.getCell(priceCol).value;

      if (!rawItemCode) {
        skipped++;
        continue;
      }

      const itemCode = rawItemCode.toString().trim().toUpperCase();
      let price = 0;

      // Parse price (support numbers and strings)
      if (rawPrice !== null && rawPrice !== undefined) {
        if (typeof rawPrice === 'number') {
          price = rawPrice;
        } else {
          const cleaned = rawPrice.toString().replace(/[^0-9.-]/g, '');
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && parsed >= 0) {
            price = parsed;
          } else {
            invalidPriceCount++;
            console.warn(`⚠️ Row ${i}: invalid price "${rawPrice}" for itemCode ${itemCode} – set to 0`);
          }
        }
      }

      if (createMissing) {
        // Upsert: create product if not exists, setting only itemCode and price (other fields will use defaults)
        operations.push({
          updateOne: {
            filter: { itemCode },
            update: {
              $set: { price, lastUpdated: new Date() },
              $setOnInsert: { itemCode, itemName: itemCode, category: 'Components', location: 'Unknown' }
            },
            upsert: true
          }
        });
      } else {
        // Update only existing products
        operations.push({
          updateOne: {
            filter: { itemCode },
            update: { $set: { price, lastUpdated: new Date() } },
            upsert: false
          }
        });
      }

      processed++;

      if (operations.length >= BATCH_SIZE) {
        await executeBatch(operations, createMissing);
        operations.length = 0;
      }
    }

    if (operations.length > 0) {
      await executeBatch(operations, createMissing);
    }

    console.log('\n📊 Summary');
    console.log(`   ✅ Rows processed: ${processed}`);
    console.log(`   ❌ Skipped (missing itemCode): ${skipped}`);
    console.log(`   ⚠️  Invalid price entries: ${invalidPriceCount}`);

    // Show sample of updated products
    const sample = await Product.find({ price: { $gt: 0 } }).limit(5);
    console.log('\n📋 Sample products with updated prices:');
    sample.forEach(p => console.log(`   ${p.itemCode} | price: ${p.price} | stock: ${p.stockQuantity}`));

    const totalUpdated = await Product.countDocuments({ lastUpdated: { $gte: new Date(Date.now() - 60 * 1000) } }); // last minute
    console.log(`\n📈 Approx products updated in this run: ${totalUpdated}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🔌 Database connection closed');
    }
    process.exit(0);
  }
}

/**
 * Execute batch of bulkWrite operations
 */
async function executeBatch(ops, createMissing) {
  try {
    const result = await Product.bulkWrite(ops, { ordered: false });
    console.log(`   Batch: matched=${result.matchedCount}, modified=${result.modifiedCount}, upserted=${result.upsertedCount || 0}`);
    if (createMissing && result.upsertedCount) {
      console.log(`      (new products created: ${result.upsertedCount})`);
    }
  } catch (error) {
    console.error('   Batch error:', error.message);
    if (error.result) {
      const r = error.result;
      console.log(`   Partial results: matched=${r.matchedCount}, modified=${r.modifiedCount}, upserted=${r.upsertedCount}`);
    }
  }
}

// ---------- Entry point ----------
const defaultFile = path.join(__dirname, 'prices.xlsx');
const filePath = process.argv[2] || defaultFile;
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  console.log('Usage: node tools/updateProductPrices.js <path-to-excel-file> [--createMissing]');
  process.exit(1);
}

// Check for optional flag --createMissing
const createMissingFlag = process.argv.includes('--createMissing');

console.log(`📁 Using file: ${filePath}`);
console.log(`🆕 Create missing products: ${createMissingFlag ? 'YES' : 'NO'}`);

updatePricesFromExcel(filePath, { createMissing: createMissingFlag });
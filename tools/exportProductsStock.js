require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Product = require('../models/Product'); // Adjust path as needed
const path = require('path');

async function exportProductsToExcel() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');

    // Fetch all products
    console.log('\n🔍 Fetching all products...');
    
    const products = await Product.find({}).lean(); // Use lean() for better performance
    
    console.log(`📊 Found ${products.length} products`);

    if (products.length === 0) {
      console.log('❌ No products found in database');
      return;
    }

    // Create Excel workbook and worksheet
    console.log('\n📝 Creating Excel file...');
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products Stock');

    // Define columns for products
    worksheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Item Code', key: 'itemCode', width: 20 },
      { header: 'Item Name', key: 'itemName', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Stock Quantity', key: 'stockQuantity', width: 15 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Minimum Stock', key: 'minimumStock', width: 15 },
      { header: 'Maximum Stock', key: 'maximumStock', width: 15 },
      { header: 'Stock Status', key: 'stockStatus', width: 15 },
      { header: 'Low Stock Alert', key: 'lowStockAlert', width: 15 },
      { header: 'Status', key: 'isActive', width: 10 },
      { header: 'Last Updated', key: 'lastUpdated', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Notes', key: 'notes', width: 30 }
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4472C4' }
    };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

    // Add data rows
    console.log('📊 Adding product data to Excel...');
    
    products.forEach((product, index) => {
      // Determine stock status
      let stockStatus = 'Normal';
      let lowStockAlert = 'No';
      
      if (product.stockQuantity === 0) {
        stockStatus = 'Out of Stock';
        lowStockAlert = 'Yes';
      } else if (product.minimumStock > 0 && product.stockQuantity <= product.minimumStock) {
        stockStatus = 'Low Stock';
        lowStockAlert = 'Yes';
      } else if (product.maximumStock > 0 && product.stockQuantity >= product.maximumStock) {
        stockStatus = 'Over Stock';
      }

      worksheet.addRow({
        sno: index + 1,
        itemCode: product.itemCode || 'N/A',
        itemName: product.itemName || 'N/A',
        description: product.description || 'N/A',
        category: product.category || 'N/A',
        location: product.location || 'N/A',
        stockQuantity: product.stockQuantity || 0,
        unit: product.unit || 'pcs',
        minimumStock: product.minimumStock || 0,
        maximumStock: product.maximumStock || 'N/A',
        stockStatus: stockStatus,
        lowStockAlert: lowStockAlert,
        isActive: product.isActive ? 'Active' : 'Inactive',
        lastUpdated: product.lastUpdated ? new Date(product.lastUpdated).toLocaleString() : 'N/A',
        createdAt: product.createdAt ? new Date(product.createdAt).toLocaleString() : 'N/A',
        notes: product.notes || 'N/A'
      });
    });

    // Add conditional formatting for stock status
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header
        const stockStatus = row.getCell('stockStatus').value;
        const lowStockCell = row.getCell('lowStockAlert');
        const statusCell = row.getCell('isActive');
        
        // Color coding for stock status
        if (stockStatus === 'Out of Stock') {
          row.getCell('stockStatus').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0000' } // Red
          };
          row.getCell('stockStatus').font = { color: { argb: 'FFFFFF' }, bold: true };
        } else if (stockStatus === 'Low Stock') {
          row.getCell('stockStatus').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFA500' } // Orange
          };
        } else if (stockStatus === 'Over Stock') {
          row.getCell('stockStatus').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF00' } // Yellow
          };
        }

        // Highlight low stock alert
        if (lowStockCell.value === 'Yes') {
          lowStockCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0000' }
          };
          lowStockCell.font = { color: { argb: 'FFFFFF' }, bold: true };
        }

        // Color coding for active/inactive
        if (statusCell.value === 'Inactive') {
          statusCell.font = { color: { argb: '808080' }, italic: true };
        }
      }
    });

    // Add borders to all cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        // Add alignment
        if (row.number === 1) {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else {
          cell.alignment = { vertical: 'middle', wrapText: true };
          
          // Center align specific columns
          const col = cell.col;
          if ([1, 7, 8, 9, 10, 11, 12, 13].includes(col)) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        }
      });
    });

    // Format numbers
    worksheet.getColumn('stockQuantity').numFmt = '#,##0';
    worksheet.getColumn('minimumStock').numFmt = '#,##0';
    worksheet.getColumn('maximumStock').numFmt = '#,##0';

    // Create summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    // Style summary header
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC000' }
    };

    // Calculate summary statistics
    const totalProducts = products.length;
    const totalStock = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);
    const activeProducts = products.filter(p => p.isActive).length;
    const inactiveProducts = products.filter(p => !p.isActive).length;
    const outOfStock = products.filter(p => p.stockQuantity === 0).length;
    const lowStock = products.filter(p => p.minimumStock > 0 && p.stockQuantity <= p.minimumStock && p.stockQuantity > 0).length;
    const overStock = products.filter(p => p.maximumStock > 0 && p.stockQuantity >= p.maximumStock).length;

    // Category breakdown
    const categoryBreakdown = products.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + 1;
      return acc;
    }, {});

    // Location breakdown
    const locationBreakdown = products.reduce((acc, curr) => {
      acc[curr.location] = (acc[curr.location] || 0) + 1;
      return acc;
    }, {});

    // Add summary data
    const summaryData = [
      { metric: 'TOTAL SUMMARY', value: '' },
      { metric: 'Total Products', value: totalProducts },
      { metric: 'Total Stock Quantity', value: totalStock },
      { metric: 'Average Stock per Product', value: Math.round(totalStock / totalProducts) },
      { metric: 'Active Products', value: `${activeProducts} (${Math.round(activeProducts/totalProducts*100)}%)` },
      { metric: 'Inactive Products', value: `${inactiveProducts} (${Math.round(inactiveProducts/totalProducts*100)}%)` },
      { metric: '', value: '' },
      { metric: 'STOCK STATUS', value: '' },
      { metric: 'Out of Stock', value: `${outOfStock} (${Math.round(outOfStock/totalProducts*100)}%)` },
      { metric: 'Low Stock', value: `${lowStock} (${Math.round(lowStock/totalProducts*100)}%)` },
      { metric: 'Over Stock', value: `${overStock} (${Math.round(overStock/totalProducts*100)}%)` },
      { metric: 'Normal Stock', value: `${totalProducts - outOfStock - lowStock - overStock} (${Math.round((totalProducts - outOfStock - lowStock - overStock)/totalProducts*100)}%)` },
      { metric: '', value: '' },
      { metric: 'CATEGORY BREAKDOWN', value: '' }
    ];

    // Add category breakdown
    Object.entries(categoryBreakdown).forEach(([category, count]) => {
      summaryData.push({ 
        metric: `  ${category}`, 
        value: `${count} (${Math.round(count/totalProducts*100)}%)` 
      });
    });

    summaryData.push({ metric: '', value: '' });
    summaryData.push({ metric: 'LOCATION BREAKDOWN', value: '' });

    // Add location breakdown
    Object.entries(locationBreakdown).forEach(([location, count]) => {
      summaryData.push({ 
        metric: `  ${location}`, 
        value: `${count} (${Math.round(count/totalProducts*100)}%)` 
      });
    });

    summaryData.push({ metric: '', value: '' });
    summaryData.push({ metric: 'EXPORT INFO', value: '' });
    summaryData.push({ metric: 'Export Date', value: new Date().toLocaleString() });
    summaryData.push({ metric: 'Generated By', value: 'Product Stock Export Script' });

    summaryData.forEach(item => {
      summarySheet.addRow(item);
    });

    // Create low stock alert sheet
    const alertSheet = workbook.addWorksheet('Low Stock Alerts');
    
    alertSheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Item Code', key: 'itemCode', width: 20 },
      { header: 'Item Name', key: 'itemName', width: 30 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Current Stock', key: 'stockQuantity', width: 15 },
      { header: 'Minimum Stock', key: 'minimumStock', width: 15 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    // Style alert sheet header
    alertSheet.getRow(1).font = { bold: true };
    alertSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0000' }
    };
    alertSheet.getRow(1).font = { color: { argb: 'FFFFFF' }, bold: true };

    // Add low stock products
    const lowStockProducts = products.filter(p => 
      (p.stockQuantity === 0) || 
      (p.minimumStock > 0 && p.stockQuantity <= p.minimumStock)
    );

    lowStockProducts.forEach((product, index) => {
      const status = product.stockQuantity === 0 ? 'Out of Stock' : 'Low Stock';
      
      alertSheet.addRow({
        sno: index + 1,
        itemCode: product.itemCode,
        itemName: product.itemName,
        category: product.category,
        location: product.location,
        stockQuantity: product.stockQuantity,
        minimumStock: product.minimumStock || 0,
        status: status
      });

      // Highlight the row
      const row = alertSheet.getRow(index + 2);
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: product.stockQuantity === 0 ? 'FFFFE0E0' : 'FFFFF0E0' }
        };
      });
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `products_stock_${timestamp}.xlsx`;
    const filePath = path.join(__dirname, fileName);

    // Write to file
    await workbook.xlsx.writeFile(filePath);
    
    console.log(`\n✅ Excel file created successfully!`);
    console.log(`📁 File saved as: ${fileName}`);
    console.log(`📍 Location: ${filePath}`);
    
    // Display sample data
    console.log('\n📊 Sample of exported products (first 5):');
    products.slice(0, 5).forEach((product, index) => {
      console.log(`\n   ${index + 1}. ${product.itemName} (${product.itemCode})`);
      console.log(`      📦 Category: ${product.category}`);
      console.log(`      📍 Location: ${product.location}`);
      console.log(`      🔢 Stock: ${product.stockQuantity} ${product.unit}`);
      console.log(`      ⚠️  Min Stock: ${product.minimumStock || 0}`);
    });

    // Show summary
    console.log('\n📈 Export Summary:');
    console.log(`   Total products exported: ${totalProducts}`);
    console.log(`   Total stock value: ${totalStock} units`);
    console.log(`   File size: ~${Math.round(products.length * 1.5)} KB (estimated)`);
    
    // Stock alerts
    console.log('\n⚠️  Stock Alerts:');
    console.log(`   🔴 Out of Stock: ${outOfStock} products`);
    console.log(`   🟠 Low Stock: ${lowStock} products`);
    console.log(`   🟡 Over Stock: ${overStock} products`);
    
    if (lowStockProducts.length > 0) {
      console.log('\n📋 Low Stock Products (first 5):');
      lowStockProducts.slice(0, 5).forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.itemName} - ${product.stockQuantity}/${product.minimumStock} ${product.unit}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Error exporting products:', error);
    console.error('Error details:', error.message);
  } finally {
    // Close database connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('\n🔌 Database connection closed.');
    }
  }
}

// Run the export
console.log('🎯 Products Stock Export Script');
console.log('='.repeat(50));
exportProductsToExcel();
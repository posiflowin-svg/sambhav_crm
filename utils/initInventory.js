// utils/initInventory.js
const Product = require('../models/Product');
const ProductInventory = require('../models/ProductInventory');

const initializeProductInventory = async () => {
  try {
    console.log('Initializing product inventory...');
    
    // Get all products
    const products = await Product.find({});
    
    for (const product of products) {
      // Check if inventory record exists
      const existingInventory = await ProductInventory.findOne({ product: product._id });
      
      if (!existingInventory) {
        // Create inventory record with 0 stock
        const inventory = new ProductInventory({
          product: product._id,
          currentStock: 0
        });
        
        await inventory.save();
        console.log(`Created inventory record for product: ${product.name}`);
      }
    }
    
    console.log('Product inventory initialization completed');
  } catch (error) {
    console.error('Error initializing product inventory:', error);
  }
};

module.exports = initializeProductInventory;
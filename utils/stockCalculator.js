// utils/stockCalculator.js
const ProductComposition = require('../models/ProductComposition');
const RawMaterial = require('../models/RawMaterial');
const StockTransaction = require('../models/StockTransaction');
const ProductInventory = require('../models/ProductInventory');

class StockCalculator {
  // Calculate material requirements for a production order
  static async calculateMaterialRequirements(productId, quantity) {
    try {
      // Get all raw materials needed for this product
      const compositions = await ProductComposition.find({ product: productId })
        .populate('rawMaterial', 'name currentStock unit');
      
      if (!compositions || compositions.length === 0) {
        throw new Error('No raw materials defined for this product');
      }
      
      const requirements = [];
      let canProduce = true;
      const missingMaterials = [];
      
      for (const comp of compositions) {
        const requiredQty = comp.quantity * quantity;
        const availableQty = comp.rawMaterial.currentStock;
        const missingQty = Math.max(0, requiredQty - availableQty);
        
        requirements.push({
          rawMaterial: comp.rawMaterial._id,
          materialName: comp.rawMaterial.name,
          requiredQuantity: requiredQty,
          availableQuantity: availableQty,
          missingQuantity: missingQty,
          unit: comp.rawMaterial.unit
        });
        
        if (missingQty > 0) {
          canProduce = false;
          missingMaterials.push({
            material: comp.rawMaterial.name,
            required: requiredQty,
            available: availableQty,
            missing: missingQty,
            unit: comp.rawMaterial.unit
          });
        }
      }
      
      return {
        requirements,
        canProduce,
        missingMaterials
      };
    } catch (error) {
      throw error;
    }
  }
  
  // Update raw material stock
  static async updateRawMaterialStock(materialId, quantity, type, performedBy, reference = null, referenceId = null, description = null) {
    try {
      const material = await RawMaterial.findById(materialId);
      
      if (!material) {
        throw new Error('Raw material not found');
      }
      
      const previousStock = material.currentStock;
      let newStock;
      
      // Determine if we're adding or removing stock
      if (type === 'raw_material_in' || type === 'adjustment') {
        newStock = previousStock + quantity;
      } else if (type === 'raw_material_out' || type === 'damage') {
        newStock = previousStock - quantity;
        
        // Prevent negative stock
        if (newStock < 0) {
          throw new Error(`Insufficient stock. Available: ${previousStock}, Required: ${quantity}`);
        }
      } else {
        throw new Error('Invalid transaction type for raw material');
      }
      
      // Update material stock
      material.currentStock = newStock;
      await material.save();
      
      // Create transaction record
      const transaction = new StockTransaction({
        type,
        item: materialId,
        itemModel: 'RawMaterial',
        itemName: material.name,
        quantity,
        unit: material.unit,
        previousStock,
        newStock,
        reference,
        referenceId,
        description,
        performedBy
      });
      
      await transaction.save();
      
      return transaction;
    } catch (error) {
      throw error;
    }
  }
  
  // Update product stock
  static async updateProductStock(productId, quantity, type, performedBy, reference = null, referenceId = null, description = null) {
    try {
      // First check if product exists in BaseProduct
      const BaseProduct = require('../models/Product');
      const product = await BaseProduct.findById(productId);
      
      if (!product) {
        throw new Error('Product not found in base product catalog');
      }
      
      // Then update the ProductInventory
      const ProductInventory = require('../models/ProductInventory');
      let inventory = await ProductInventory.findOne({ product: productId });
      
      if (!inventory) {
        // Create inventory record if it doesn't exist
        inventory = new ProductInventory({
          product: productId,
          currentStock: 0,
          minimumStockLevel: 0
        });
      }
      
      const previousStock = inventory.currentStock;
      let newStock;
      
      // Determine if we're adding or removing stock
      if (type === 'product_in' || type === 'adjustment') {
        newStock = previousStock + quantity;
      } else if (type === 'product_out' || type === 'damage') {
        newStock = previousStock - quantity;
        
        // Prevent negative stock
        if (newStock < 0) {
          throw new Error(`Insufficient product stock. Available: ${previousStock}, Required: ${quantity}`);
        }
      } else {
        throw new Error('Invalid transaction type for product');
      }
      
      // Update inventory
      inventory.currentStock = newStock;
      inventory.lastUpdated = new Date();
      await inventory.save();
      
      // Create transaction record
      const transaction = new StockTransaction({
        type,
        item: productId,
        itemModel: 'Product',
        itemName: product.name,
        quantity,
        unit: 'pcs',
        previousStock,
        newStock,
        reference,
        referenceId,
        description,
        performedBy
      });
      
      await transaction.save();
      
      return transaction;
    } catch (error) {
      throw error;
    }
  }
      
  // Get product current stock
  static async getProductStock(productId) {
    try {
      const inventory = await ProductInventory.findOne({ product: productId });
      return inventory ? inventory.currentStock : 0;
    } catch (error) {
      throw error;
    }
  }
  
  // Get maximum producible quantity for a product
  static async getMaxProducibleQuantity(productId) {
    try {
      const compositions = await ProductComposition.find({ product: productId })
        .populate('rawMaterial', 'currentStock');
      
      if (!compositions || compositions.length === 0) {
        return 0;
      }
      
      let maxQuantity = Infinity;
      
      for (const comp of compositions) {
        const possibleFromThisMaterial = Math.floor(comp.rawMaterial.currentStock / comp.quantity);
        maxQuantity = Math.min(maxQuantity, possibleFromThisMaterial);
      }
      
      return maxQuantity === Infinity ? 0 : maxQuantity;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = StockCalculator;
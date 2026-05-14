// services/CriticaService.js
const PincodeServiceability = require('../models/PincodeServiceability');

class CriticaService {
  /**
   * Check if pincode is serviceable for Critica
   * @param {string} pincode - The pincode to check
   * @returns {Promise<boolean>} - Whether the pincode is serviceable
   */
  async checkAvailability(pincode) {
    try {
      // console.log(`🔍 Checking Critica availability for pincode: "${pincode}"`);

      if (!pincode || typeof pincode !== 'string') {
        // console.log(`❌ Invalid pincode: ${pincode}`);
        return false;
      }

      // Clean the pincode (remove spaces, etc.)
      const cleanPincode = pincode.trim();
      // console.log(`🧹 Cleaned pincode: "${cleanPincode}"`);

      // Check in database
      // console.log(`📊 Querying database for SERVICEABLE pincode: ${cleanPincode}`);
      const serviceability = await PincodeServiceability.findOne({
        pincode: cleanPincode,
        serviceType: 'SERVICEABLE',
        isActive: true
      });

      // console.log(`📋 Query result:`, serviceability ? 'FOUND' : 'NOT FOUND');
      
      if (serviceability) {
        // console.log(`✅ Pincode ${cleanPincode} is SERVICEABLE - ${serviceability.controllingCityName}`);
      } else {
        // console.log(`❌ Pincode ${cleanPincode} is NOT SERVICEABLE or not found in database`);
        
        // Let's also check if the pincode exists with different service type
        const anyRecord = await PincodeServiceability.findOne({
          pincode: cleanPincode
        });
        
        if (anyRecord) {
          // console.log(`ℹ️  Pincode exists but with serviceType: ${anyRecord.serviceType}, isActive: ${anyRecord.isActive}`);
        } else {
          // console.log(`🔎 Pincode ${cleanPincode} not found in database at all`);
        }
      }

      const isAvailable = !!serviceability;
      // console.log(`🎯 Final availability result for ${cleanPincode}: ${isAvailable}`);
      
      return isAvailable;
    } catch (error) {
      console.error('🚨 Error checking critica availability:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Bulk check multiple pincodes
   * @param {string[]} pincodes - Array of pincodes to check
   * @returns {Promise<Object>} - Object with pincode as key and availability as value
   */
  async bulkCheckAvailability(pincodes) {
    try {
      const cleanPincodes = pincodes.map(p => p.trim()).filter(p => p);
      
      const serviceablePincodes = await PincodeServiceability.find({
        pincode: { $in: cleanPincodes },
        serviceType: 'SERVICEABLE',
        isActive: true
      }).select('pincode -_id');

      const serviceableSet = new Set(serviceablePincodes.map(sp => sp.pincode));
      
      const result = {};
      cleanPincodes.forEach(pincode => {
        result[pincode] = serviceableSet.has(pincode);
      });

      return result;
    } catch (error) {
      console.error('Error in bulk critica availability check:', error);
      return {};
    }
  }

  /**
   * Get serviceability details for a pincode
   * @param {string} pincode - The pincode to check
   * @returns {Promise<Object|null>} - Serviceability details or null
   */
  async getServiceabilityDetails(pincode) {
    try {
      const cleanPincode = pincode.trim();
      
      return await PincodeServiceability.findOne({
        pincode: cleanPincode,
        isActive: true
      });
    } catch (error) {
      console.error('Error getting serviceability details:', error);
      return null;
    }
  }
}

module.exports = new CriticaService();
const ProductOrder = require('../models/ProductOrder');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const Counter = require('../models/Counter');

/**
 * Generates a unique order number using an atomic counter.
 * Logs the process for debugging.
 */
const generateOrderNumber = async (session = null) => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `PO-${year}${month}`;

  console.log(`[OrderNumber] Generating new number for prefix: ${prefix}`);

  try {
    // Atomically increment the counter for this month's prefix
    const counter = await Counter.findOneAndUpdate(
      { name: prefix },
      { $inc: { seq: 1 } },
      { 
        new: true, 
        upsert: true,
        session // Pass session if you want it part of the transaction
      }
    );

    const seq = counter.seq.toString().padStart(4, '0');
    const orderNumber = `${prefix}-${seq}`;

    console.log(`[OrderNumber] Generated: ${orderNumber} (counter seq: ${counter.seq})`);
    return orderNumber;

  } catch (error) {
    console.error('[OrderNumber] Failed to generate number:', error);
    // Fallback: use timestamp + random to avoid collisions
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fallbackNumber = `PO-${timestamp}-${random}`;
    console.warn(`[OrderNumber] Using fallback: ${fallbackNumber}`);
    return fallbackNumber;
  }
};

// Render PO management page
exports.renderPOManagement = async (req, res) => {
    try {
        res.render('products/po-management', {
            title: 'Purchase Order Management',
            user: req.user,
            activePage: 'po'
        });
    } catch (error) {
        console.error('Error rendering PO page:', error);
        res.status(500).send('Server Error');
    }
};

// API: Get all POs with filters
exports.getPOs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Build filter query
        let query = {};
        
        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            query.orderDate = {};
            if (req.query.startDate) {
                query.orderDate.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                const endDate = new Date(req.query.endDate);
                endDate.setHours(23, 59, 59, 999);
                query.orderDate.$lte = endDate;
            }
        }

        // Status filter
        if (req.query.status && req.query.status !== 'all') {
            query.status = req.query.status;
        }

        // Search by order number or supplier
        if (req.query.search) {
            query.$or = [
                { orderNumber: { $regex: req.query.search, $options: 'i' } },
                { 'supplier.name': { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const pos = await ProductOrder.find(query)
            .populate('createdBy', 'username email')
            .populate('items.product')
            .sort({ orderDate: -1 })
            .skip(skip)
            .limit(limit);

        const total = await ProductOrder.countDocuments(query);

        // Get summary statistics
        const stats = await ProductOrder.aggregate([
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    deliveredOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                    },
                    partialOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'partially_delivered'] }, 1, 0] }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: pos,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            },
            stats: stats[0] || {
                totalOrders: 0,
                pendingOrders: 0,
                deliveredOrders: 0,
                partialOrders: 0
            }
        });
    } catch (error) {
        console.error('Error fetching POs:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// API: Get products for dropdown
exports.getProducts = async (req, res) => {
    try {
        const products = await Product.find({ isActive: true })
            .select('itemCode itemName category unit stockQuantity')
            .sort('itemCode');
        
        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// API: Get single PO
exports.getPO = async (req, res) => {
    try {
        const po = await ProductOrder.findById(req.params.id)
            .populate('createdBy', 'username email')
            .populate('items.product')
            .populate('items.receivedHistory.receivedBy', 'username');
        
        if (!po) {
            return res.status(404).json({
                success: false,
                message: 'PO not found'
            });
        }

        res.json({
            success: true,
            data: po
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.createPO = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, supplier, expectedDelivery, notes } = req.body;

    // Validate items
    if (!items || items.length === 0) {
      throw new Error('At least one item is required');
    }

    // Process items and validate products
    for (let item of items) {
      if (!item.product || !item.quantity) {
        throw new Error('Each item must have product and quantity');
      }

      const product = await Product.findById(item.product);
      if (!product) {
        throw new Error(`Product not found: ${item.product}`);
      }

      item.unit = product.unit;
    }

    // Generate unique order number (atomic)
    const orderNumber = await generateOrderNumber(session);

    // Create PO
    const po = new ProductOrder({
      orderNumber,
      items,
      supplier,
      expectedDelivery: expectedDelivery || null,
      notes,
      createdBy: req.user._id,
      status: 'pending'
    });

    await po.save({ session });
    await session.commitTransaction();

    console.log(`[PO Created] ${orderNumber} saved successfully`);

    res.status(201).json({
      success: true,
      message: 'Purchase Order created successfully',
      data: po
    });
  } catch (error) {
    await session.abortTransaction();
    console.error(`[PO Creation Error] ${error.message}`, error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  } finally {
    session.endSession();
  }
};

// API: Update PO, preserving each line's inward history and stock ledger.
exports.updatePO = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const po = await ProductOrder.findById(req.params.id).session(session);
        if (!po) throw new Error('PO not found');
        if (['delivered', 'cancelled'].includes(po.status)) throw new Error('Delivered or cancelled POs cannot be edited');
        const { items, supplier, expectedDelivery, notes } = req.body;
        if (!Array.isArray(items) || !items.length) throw new Error('At least one item is required');
        const seen = new Set();
        const nextItems = [];
        for (const input of items) {
            const quantity = Number(input.quantity);
            const price = Number(input.pricePerUnit);
            if (!mongoose.isValidObjectId(input.product) || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) {
                throw new Error('Invalid product, quantity or unit price');
            }
            const product = await Product.findById(input.product).session(session);
            if (!product) throw new Error('Product not found');
            if (input.itemId) {
                if (!mongoose.isValidObjectId(input.itemId) || seen.has(String(input.itemId))) throw new Error('Invalid or duplicate PO line');
                const existing = po.items.id(input.itemId);
                if (!existing) throw new Error('PO line not found');
                if (String(existing.product) !== String(product._id) && existing.receivedQuantity > 0) {
                    throw new Error('Cannot change product on an already received line');
                }
                if (quantity < existing.receivedQuantity) throw new Error('Quantity cannot be less than received quantity');
                seen.add(String(existing._id));
                const preserved = existing.toObject();
                preserved.product = product._id;
                preserved.quantity = quantity;
                preserved.pricePerUnit = price;
                preserved.unit = product.unit;
                nextItems.push(preserved);
            } else {
                nextItems.push({ product: product._id, quantity, pricePerUnit: price, unit: product.unit });
            }
        }
        for (const existing of po.items) {
            if (!seen.has(String(existing._id)) && existing.receivedQuantity > 0) {
                throw new Error('Cannot remove a PO line with received stock');
            }
        }
        if (!supplier || !String(supplier.name || '').trim()) throw new Error('Supplier name is required');
        po.items = nextItems;
        po.supplier = { name: String(supplier.name).trim(), contact: String(supplier.contact || '') };
        po.expectedDelivery = expectedDelivery || undefined;
        if (notes !== undefined) po.notes = notes;
        // Derive status from inward quantities rather than trusting a manually supplied status.
        if (po.items.some(i => i.receivedQuantity > 0)) po.updateStatus();
        await po.save({ session });
        await session.commitTransaction();
        res.json({ success: true, message: 'PO updated successfully', data: po });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: error.message });
    } finally { session.endSession(); }
};

// Cancel a wrongly received PO and reverse its stock in one database transaction.
// Keep the PO and original inward records for audit instead of hard-deleting them.
exports.reversePO = async (req, res) => {
    if (!req.user || !['admin', 'stock_manager'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or Stock Manager may reverse a PO' });
    }
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 8) return res.status(400).json({ success: false, message: 'Please enter a reversal reason (minimum 8 characters)' });
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const po = await ProductOrder.findById(req.params.id).session(session);
            if (!po) throw new Error('PO not found');
            if (po.status === 'cancelled' || po.reversal?.reversedAt) throw new Error('This PO is already cancelled/reversed');
            const byProduct = new Map();
            for (const line of po.items) {
                const qty = Number(line.receivedQuantity || 0);
                if (!Number.isFinite(qty) || qty < 0) throw new Error('Invalid received quantity in PO');
                if (qty > 0) {
                    const key = String(line.product);
                    byProduct.set(key, (byProduct.get(key) || 0) + qty);
                }
            }
            const StockTransaction = require('../models/StockTransaction');
            const reversals = [];
            for (const [id, quantity] of byProduct) {
                const product = await Product.findById(id).session(session);
                if (!product) throw new Error(`Product ${id} no longer exists; manual stock reconciliation required`);
                const previousStock = Number(product.stockQuantity || 0);
                if (previousStock < quantity) throw new Error(`Cannot reverse ${product.itemName}: current stock ${previousStock}, PO inward ${quantity}. Stock may already have been consumed.`);
                // Atomic conditional update prevents concurrent reversals from creating negative stock.
                const updated = await Product.updateOne({ _id: id, stockQuantity: { $gte: quantity } }, { $inc: { stockQuantity: -quantity }, $set: { lastUpdated: new Date() } }, { session });
                if (updated.modifiedCount !== 1) throw new Error(`Stock changed while reversing ${product.itemName}; retry`);
                reversals.push({ product: product._id, quantity });
                await StockTransaction.create([{ type: 'stock_out', item: product._id, itemCode: product.itemCode, itemName: product.itemName, category: product.category, location: product.location, quantity: -quantity, unit: product.unit, previousStock, newStock: previousStock - quantity, reference: po.orderNumber, referenceId: po._id, description: `PO inward reversal: ${reason}`, performedBy: req.user._id }], { session });
            }
            po.reversal = { reason, reversedAt: new Date(), reversedBy: req.user._id, quantities: reversals };
            po.status = 'cancelled';
            await po.save({ session });
        });
        res.json({ success: true, message: 'PO cancelled and received stock reversed successfully. Audit history retained.' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    } finally { await session.endSession(); }
};

// API: Receive items
exports.receiveItems = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { items } = req.body;
        const po = await ProductOrder.findById(req.params.id)
            .populate('items.product');

        if (!po) {
            throw new Error('PO not found');
        }

        if (po.status === 'delivered') {
            throw new Error('Order is already fully delivered');
        }

        if (po.status === 'cancelled') {
            throw new Error('Cannot receive cancelled order');
        }

        // Process each received item
        for (const receivedItem of items) {
            const poItem = po.items.id(receivedItem.itemId);
            if (!poItem) {
                throw new Error(`Item not found in PO`);
            }

            const quantity = parseInt(receivedItem.quantity);
            if (quantity <= 0) {
                throw new Error('Quantity must be positive');
            }

            const newReceived = poItem.receivedQuantity + quantity;
            if (newReceived > poItem.quantity) {
                throw new Error(`Received quantity exceeds ordered quantity for ${poItem.product.itemCode}`);
            }

            // Update received quantity and history
            poItem.receivedQuantity = newReceived;
            poItem.receivedHistory.push({
                quantity,
                receivedDate: new Date(),
                receivedBy: req.user._id,
                notes: receivedItem.notes || ''
            });

            // Update product stock
            const product = poItem.product;
            await product.updateStock(
                quantity,
                'stock_in',
                req.user._id,
                po.orderNumber,
                `Received from PO: ${po.orderNumber}`
            );
        }

        // Update PO status
        po.updateStatus();
        await po.save({ session });
        await session.commitTransaction();

        res.json({
            success: true,
            message: 'Items received successfully',
            data: po
        });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({
            success: false,
            message: error.message
        });
    } finally {
        session.endSession();
    }
};

// API: Create product and PO in one go
exports.createProductAndPO = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { product, po } = req.body;

        // Create product first
        const newProduct = new Product({
            ...product,
            createdBy: req.user._id
        });

        await newProduct.save({ session });

        // Generate order number
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const count = await ProductOrder.countDocuments() + 1;
        const orderNumber = `PO-${year}${month}-${count.toString().padStart(4, '0')}`;

        // Create PO with the new product
        const newPO = new ProductOrder({
            orderNumber,
            items: [{
                product: newProduct._id,
                quantity: po.quantity,
                unit: newProduct.unit
            }],
            supplier: po.supplier,
            expectedDelivery: po.expectedDelivery,
            notes: po.notes,
            createdBy: req.user._id,
            status: 'pending'
        });

        await newPO.save({ session });
        await session.commitTransaction();

        res.status(201).json({
            success: true,
            message: 'Product and PO created successfully',
            data: {
                product: newProduct,
                po: newPO
            }
        });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({
            success: false,
            message: error.message
        });
    } finally {
        session.endSession();
    }
};

// API: Export POs to Excel
exports.exportPOsToExcel = async (req, res) => {
    try {
        // Build filter query (same as getPOs)
        let query = {};
        
        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            query.orderDate = {};
            if (req.query.startDate) {
                query.orderDate.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                const endDate = new Date(req.query.endDate);
                endDate.setHours(23, 59, 59, 999);
                query.orderDate.$lte = endDate;
            }
        }

        // Status filter
        if (req.query.status && req.query.status !== 'all') {
            query.status = req.query.status;
        }

        // Search by order number or supplier
        if (req.query.search) {
            query.$or = [
                { orderNumber: { $regex: req.query.search, $options: 'i' } },
                { 'supplier.name': { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const pos = await ProductOrder.find(query)
            .populate('createdBy', 'username email')
            .populate('items.product')
            .sort({ orderDate: -1 });

        // Create Excel workbook
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'StockMaster';
        workbook.created = new Date();

        // Add worksheet
        const worksheet = workbook.addWorksheet('Purchase Orders', {
            properties: { tabColor: { argb: 'FF2E75B5' } },
            pageSetup: { paperSize: 9, orientation: 'landscape' }
        });

        // Add title with filters info
        const titleRow = worksheet.addRow(['Purchase Orders Report']);
        titleRow.font = { size: 16, bold: true, color: { argb: 'FF2E75B5' } };
        worksheet.addRow([]); // Empty row

        // Add filter information
        const filterInfo = [];
        if (req.query.startDate) filterInfo.push(`From: ${req.query.startDate}`);
        if (req.query.endDate) filterInfo.push(`To: ${req.query.endDate}`);
        if (req.query.status && req.query.status !== 'all') filterInfo.push(`Status: ${req.query.status}`);
        if (req.query.search) filterInfo.push(`Search: ${req.query.search}`);
        
        if (filterInfo.length > 0) {
            const filterRow = worksheet.addRow([`Filters: ${filterInfo.join(' | ')}`]);
            filterRow.font = { italic: true, color: { argb: 'FF666666' } };
            worksheet.addRow([]); // Empty row
        }

        // Add generation date
        const dateRow = worksheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);
        dateRow.font = { italic: true, size: 10 };
        worksheet.addRow([]); // Empty row

        // Define columns
        worksheet.columns = [
            { header: 'PO Number', key: 'orderNumber', width: 18 },
            { header: 'Order Date', key: 'orderDate', width: 15 },
            { header: 'Supplier Name', key: 'supplierName', width: 25 },
            { header: 'Supplier Contact', key: 'supplierContact', width: 20 },
            { header: 'Items Count', key: 'itemsCount', width: 12 },
            { header: 'Total Quantity', key: 'totalQuantity', width: 15 },
            { header: 'Received Quantity', key: 'receivedQuantity', width: 18 },
            { header: 'Status', key: 'status', width: 18 },
            { header: 'Expected Delivery', key: 'expectedDelivery', width: 15 },
            { header: 'Actual Delivery', key: 'actualDelivery', width: 15 },
            { header: 'Created By', key: 'createdBy', width: 20 },
            { header: 'Notes', key: 'notes', width: 30 }
        ];

        // Style the header row
        worksheet.getRow(worksheet._rows.length).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF2E75B5' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Add data rows
        pos.forEach(po => {
            // Calculate totals
            const totalQuantity = po.items.reduce((sum, item) => sum + item.quantity, 0);
            const receivedQuantity = po.items.reduce((sum, item) => sum + item.receivedQuantity, 0);
            
            const row = worksheet.addRow({
                orderNumber: po.orderNumber,
                orderDate: po.orderDate ? new Date(po.orderDate).toLocaleDateString() : 'N/A',
                supplierName: po.supplier?.name || 'N/A',
                supplierContact: po.supplier?.contact || 'N/A',
                itemsCount: po.items.length,
                totalQuantity: totalQuantity,
                receivedQuantity: receivedQuantity,
                status: po.status.replace('_', ' ').toUpperCase(),
                expectedDelivery: po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : 'N/A',
                actualDelivery: po.actualDelivery ? new Date(po.actualDelivery).toLocaleDateString() : 'N/A',
                createdBy: po.createdBy?.username || 'N/A',
                notes: po.notes || ''
            });

            // Style data cells
            row.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                
                // Center align specific columns
                if ([2, 5, 6, 7, 9, 10].includes(colNumber)) {
                    cell.alignment = { horizontal: 'center' };
                }
            });

            // Color code status
            const statusCell = row.getCell(8); // Status column
            switch(po.status) {
                case 'delivered':
                    statusCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFC6EFCE' } // Light green
                    };
                    break;
                case 'pending':
                    statusCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFEB9C' } // Light yellow
                    };
                    break;
                case 'cancelled':
                    statusCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFC7CE' } // Light red
                    };
                    break;
                case 'partially_delivered':
                    statusCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFE599' } // Orange-yellow
                    };
                    break;
            }
        });

        // Add summary row
        worksheet.addRow([]); // Empty row
        const summaryRow = worksheet.addRow([
            'SUMMARY',
            '',
            '',
            '',
            `Total Orders: ${pos.length}`,
            `Total Items: ${pos.reduce((sum, po) => sum + po.items.length, 0)}`,
            '',
            '',
            '',
            '',
            '',
            ''
        ]);
        summaryRow.font = { bold: true };
        summaryRow.getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
        };

        // Auto-filter
        worksheet.autoFilter = {
            from: { row: worksheet._rows.length - pos.length - 1, column: 1 },
            to: { row: worksheet._rows.length - pos.length - 1, column: worksheet.columnCount }
        };

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=purchase-orders-${Date.now()}.xlsx`);

        // Write to response
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export data: ' + error.message
        });
    }
};
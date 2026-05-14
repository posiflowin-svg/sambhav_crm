const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Order = require('../../models/Order');
const Customer = require('../../models/Customer');

// Generate Invoice PDF
router.get('/:orderId/invoice', async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('customer')
            .populate('salesPerson', 'name')
            .populate('products.product');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Create PDF document
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4'
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=INVOICE-${order.invoiceNo || order._id}.pdf`);

        // Pipe PDF to response
        doc.pipe(res);

        // Helper function to format date
        const formatDate = (date) => {
            if (!date) return 'N/A';
            const d = new Date(date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        };

        // Helper function to format currency
        const formatCurrency = (amount) => {
            return amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
        };

        // Helper function to convert number to words
        const numberToWords = (num) => {
            const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
            const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
            
            if (num === 0) return 'Zero';
            
            const numStr = num.toFixed(2).toString();
            const [rupees, paise] = numStr.split('.');
            
            function convertThreeDigits(n) {
                const num = parseInt(n);
                if (num === 0) return '';
                if (num < 20) return ones[num];
                if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
                return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + convertThreeDigits(num % 100) : '');
            }
            
            function convertRupees(rs) {
                const num = parseInt(rs);
                if (num === 0) return '';
                
                const crores = Math.floor(num / 10000000);
                const lakhs = Math.floor((num % 10000000) / 100000);
                const thousands = Math.floor((num % 100000) / 1000);
                const hundreds = num % 1000;
                
                let result = '';
                if (crores > 0) result += convertThreeDigits(crores) + ' Crore ';
                if (lakhs > 0) result += convertThreeDigits(lakhs) + ' Lakh ';
                if (thousands > 0) result += convertThreeDigits(thousands) + ' Thousand ';
                if (hundreds > 0) result += convertThreeDigits(hundreds);
                
                return result.trim();
            }
            
            let words = convertRupees(rupees) + ' Rupees';
            
            if (parseInt(paise) > 0) {
                words += ' and ' + convertThreeDigits(paise) + ' Paise';
            }
            
            return words;
        };

        // Add company logo/header
        doc.fontSize(20).font('Helvetica-Bold')
           .text('SAMBHAV ELECTRONICS', 50, 50);
        
        doc.fontSize(10).font('Helvetica')
           .text('3rd floor B-320 Sussex Industrial Estate', 50, 75)
           .text('Dadoji Kondev Road, Ghodapdeo, Byculla East', 50, 88)
           .text('Phone: 9773397486', 50, 101)
           .text('GSTIN: 27AMXP79211L27', 50, 114);

        // Invoice Title
        doc.fontSize(16).font('Helvetica-Bold')
           .text('TAX INVOICE', 400, 50);

        // Invoice Details
        doc.fontSize(10).font('Helvetica')
           .text(`Invoice No.: ${order.invoiceNo || 'N/A'}`, 400, 75)
           .text(`Date: ${formatDate(order.orderDate)}`, 400, 88)
           .text(`Place of supply: ${order.customer?.state || 'Maharashtra'}`, 400, 101)
           .text(`PO Number: ${order.poNumber || 'N/A'}`, 400, 114);

        // Draw line
        doc.moveTo(50, 140).lineTo(550, 140).stroke();

        // Bill To Section
        doc.fontSize(12).font('Helvetica-Bold')
           .text('Bill To', 50, 160);

        doc.fontSize(10).font('Helvetica')
           .text(order.customer?.name || 'N/A', 50, 180)
           .text(order.customer?.address?.street || '', 50, 193)
           .text(`${order.customer?.address?.city || ''} - ${order.customer?.address?.pincode || ''}`, 50, 206)
           .text(`State: ${order.customer?.state || 'Maharashtra'}`, 50, 219)
           .text(`GSTIN: ${order.customer?.gstin || 'N/A'}`, 50, 232);

        // Transportation Details
        doc.fontSize(12).font('Helvetica-Bold')
           .text('Transportation Details', 300, 160);

        doc.fontSize(10).font('Helvetica')
           .text(`Transport Name: ${order.trackingId ? 'Trackon' : 'N/A'}`, 300, 180)
           .text(`Tracking ID: ${order.trackingId || 'N/A'}`, 300, 193);

        // Sold By
        doc.fontSize(10).font('Helvetica')
           .text(`Sold By: ${order.salesPerson?.name || 'Poonam'}`, 300, 219);

        // Draw line
        doc.moveTo(50, 250).lineTo(550, 250).stroke();

        // Table Header
        const tableTop = 270;
        
        // Define column positions with better spacing
        const colSr = 50;      // Serial Number
        const colItem = 80;    // Item Name
        const colHsn = 230;    // HSN/SAC
        const colQty = 310;    // Quantity
        const colRate = 360;   // Rate/Unit
        const colAmount = 440; // Amount

        // Draw table header background
        doc.rect(45, tableTop - 5, 510, 20).fill('#f0f0f0');
        
        // Table Header Text
        doc.fillColor('black').fontSize(10).font('Helvetica-Bold');
        doc.text('Sr.', colSr, tableTop, { width: 30, align: 'center' })
           .text('Item Name', colItem, tableTop, { width: 140 })
           .text('HSN/SAC', colHsn, tableTop, { width: 70, align: 'center' })
           .text('Qty', colQty, tableTop, { width: 40, align: 'center' })
           .text('Price/Unit', colRate, tableTop, { width: 70, align: 'right' })
           .text('Amount', colAmount, tableTop, { width: 80, align: 'right' });

        // Draw header underline
        doc.strokeColor('#cccccc').lineWidth(1)
           .moveTo(45, tableTop + 15)
           .lineTo(555, tableTop + 15)
           .stroke();

        // Table Rows
        let yPosition = tableTop + 25;
        let subtotal = 0;

        // Draw items
        order.products.forEach((item, index) => {
            const hsn = item.product?.hsnCode || 'N/A';
            const amount = item.quantity * item.rate;
            subtotal += amount;

            // Serial Number
            doc.fillColor('black').font('Helvetica').fontSize(9)
               .text((index + 1).toString(), colSr, yPosition, { width: 30, align: 'center' });
            
            // Item Name (handle long names)
            const itemName = item.name.length > 25 ? item.name.substring(0, 22) + '...' : item.name;
            doc.text(itemName, colItem, yPosition, { width: 140 });
            
            // HSN
            doc.text(hsn, colHsn, yPosition, { width: 70, align: 'center' });
            
            // Quantity
            doc.text(item.quantity.toString(), colQty, yPosition, { width: 40, align: 'center' });
            
            // Rate
            doc.text(formatCurrency(item.rate), colRate, yPosition, { width: 70, align: 'right' });
            
            // Amount
            doc.text(formatCurrency(amount), colAmount, yPosition, { width: 80, align: 'right' });

            yPosition += 20;

            // Add light gray line between rows
            doc.strokeColor('#eeeeee').lineWidth(0.5)
               .moveTo(45, yPosition - 10)
               .lineTo(555, yPosition - 10)
               .stroke();

            // Add new page if needed
            if (yPosition > 700) {
                doc.addPage();
                yPosition = 50;
                
                // Redraw header on new page
                doc.rect(45, yPosition - 5, 510, 20).fill('#f0f0f0');
                doc.fillColor('black').fontSize(10).font('Helvetica-Bold');
                doc.text('Sr.', colSr, yPosition, { width: 30, align: 'center' })
                   .text('Item Name', colItem, yPosition, { width: 140 })
                   .text('HSN/SAC', colHsn, yPosition, { width: 70, align: 'center' })
                   .text('Qty', colQty, yPosition, { width: 40, align: 'center' })
                   .text('Price/Unit', colRate, yPosition, { width: 70, align: 'right' })
                   .text('Amount', colAmount, yPosition, { width: 80, align: 'right' });
                
                doc.strokeColor('#cccccc').lineWidth(1)
                   .moveTo(45, yPosition + 15)
                   .lineTo(555, yPosition + 15)
                   .stroke();
                
                yPosition += 25;
            }
        });

        // Shipping row if exists
        if (order.shippingCharges && order.shippingCharges > 0) {
            doc.font('Helvetica').fontSize(9);
            
            // Serial Number
            doc.text((order.products.length + 1).toString(), colSr, yPosition, { width: 30, align: 'center' });
            
            // Shipping description
            doc.text('Shipping Charges', colItem, yPosition, { width: 140 });
            
            // Empty HSN
            doc.text('', colHsn, yPosition);
            
            // Quantity
            doc.text('1', colQty, yPosition, { width: 40, align: 'center' });
            
            // Rate
            doc.text(formatCurrency(order.shippingCharges), colRate, yPosition, { width: 70, align: 'right' });
            
            // Amount
            doc.text(formatCurrency(order.shippingCharges), colAmount, yPosition, { width: 80, align: 'right' });

            yPosition += 20;
            subtotal += order.shippingCharges;
        }

        // Draw total items count
        doc.fillColor('#666666').fontSize(8).font('Helvetica-Oblique')
           .text(`Total Items: ${order.products.length} ${order.shippingCharges ? '+ Shipping' : ''}`, 50, yPosition);
        yPosition += 15;

        // Draw thick line before totals
        doc.strokeColor('#333333').lineWidth(2)
           .moveTo(350, yPosition)
           .lineTo(550, yPosition)
           .stroke();
        yPosition += 10;

        // Calculate taxes
        const gstAmount = order.gstAmount || 0;
        const total = order.totalAmount || subtotal + gstAmount;

        // Draw totals section
        doc.fillColor('black').fontSize(10);
        
        // Subtotal
        doc.font('Helvetica-Bold')
           .text('Sub Total:', 400, yPosition);
        doc.font('Helvetica')
           .text(formatCurrency(subtotal), 480, yPosition, { align: 'right', width: 70 });
        yPosition += 20;

        // GST
        if (order.includeGst) {
            doc.font('Helvetica-Bold')
               .text('IGST @ 18%:', 400, yPosition);
            doc.font('Helvetica')
               .text(formatCurrency(gstAmount), 480, yPosition, { align: 'right', width: 70 });
            yPosition += 20;
        }

        // Draw line before total
        doc.strokeColor('#333333').lineWidth(1)
           .moveTo(400, yPosition - 5)
           .lineTo(550, yPosition - 5)
           .stroke();

        // Total
        doc.font('Helvetica-Bold').fontSize(11)
           .text('TOTAL:', 400, yPosition);
        doc.font('Helvetica-Bold')
           .text(formatCurrency(total), 480, yPosition, { align: 'right', width: 70 });
        yPosition += 25;

        // Amount in words
        doc.fillColor('#333333').fontSize(9).font('Helvetica')
           .text('Invoice Amount In Words:', 50, yPosition);
        yPosition += 12;
        doc.font('Helvetica-Bold').fontSize(10)
           .text(numberToWords(total) + ' Only', 50, yPosition, { width: 300 });

        // Terms and Conditions
        yPosition += 25;
        doc.fillColor('black').fontSize(10).font('Helvetica-Bold')
           .text('Terms and Conditions:', 50, yPosition);
        yPosition += 15;
        doc.fontSize(9).font('Helvetica')
           .text('• Thanks for doing business with us!', 50, yPosition)
           .text('• Goods once sold will not be taken back', 50, yPosition + 12);
        //    .text('• Payment due within 30 days', 50, yPosition + 24);

        // Footer with signature
        yPosition = 730;
        doc.fontSize(10).font('Helvetica-Bold')
           .text('For: SAMBHAV ELECTRONICS', 400, yPosition);
        yPosition += 20;
        doc.text('Authorized Signatory', 430, yPosition);
        
        // Add a line for signature
        doc.moveTo(430, yPosition + 5).lineTo(530, yPosition + 5).stroke();

        // Add border around the invoice
        doc.rect(45, 40, 515, 730).stroke();

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
});

// Helper function to format date
function formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// Helper function to convert number to words (Indian Rupees)
function numberToWords(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (num === 0) return 'Zero';
    
    const numStr = num.toFixed(2).toString();
    const [rupees, paise] = numStr.split('.');
    
    function convertThreeDigits(n) {
        const num = parseInt(n);
        if (num === 0) return '';
        if (num < 20) return ones[num];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
        return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + convertThreeDigits(num % 100) : '');
    }
    
    function convertRupees(rs) {
        const num = parseInt(rs);
        if (num === 0) return '';
        
        const crores = Math.floor(num / 10000000);
        const lakhs = Math.floor((num % 10000000) / 100000);
        const thousands = Math.floor((num % 100000) / 1000);
        const hundreds = num % 1000;
        
        let result = '';
        if (crores > 0) result += convertThreeDigits(crores) + ' Crore ';
        if (lakhs > 0) result += convertThreeDigits(lakhs) + ' Lakh ';
        if (thousands > 0) result += convertThreeDigits(thousands) + ' Thousand ';
        if (hundreds > 0) result += convertThreeDigits(hundreds);
        
        return result.trim();
    }
    
    let words = convertRupees(rupees) + ' Rupees';
    
    if (parseInt(paise) > 0) {
        words += ' and ' + convertThreeDigits(paise) + ' Paise';
    }
    
    return words;
}

module.exports = router;
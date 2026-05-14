const PDFDocument = require('pdfkit');
const { numberToWords } = require('./numberToWords');

const wrapText = (doc, text, x, y, maxWidth, lineHeight = 12) => {
  const words = text.split(' ');
  let line = '';
  let lineY = y;

  words.forEach((word, i) => {
    const testLine = line + word + ' ';
    const testWidth = doc.widthOfString(testLine);
    if (testWidth > maxWidth && i > 0) {
      doc.text(line.trim(), x, lineY);
      line = word + ' ';
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  });

  if (line.trim()) {
    doc.text(line.trim(), x, lineY);
  }

  return lineY + lineHeight;
};

const generateBulkInvoices = (orders, taxRateLabel = '') => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    
    // Set max listeners to avoid warning
    doc.setMaxListeners(orders.length + 10);
    
    // Add event listeners only once
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      // Add cover page with tax rate info
      doc.font('Helvetica-Bold').fontSize(24).text('Bulk Order Invoices', 50, 50, { align: 'center' });
      doc.font('Helvetica').fontSize(16).text(`Tax Rate: ${taxRateLabel}`, 50, 90, { align: 'center' });
      doc.fontSize(14).text(`Generated on ${new Date().toLocaleString()}`, 50, 120, { align: 'center' });
      doc.text(`Total Orders: ${orders.length}`, 50, 150, { align: 'center' });
      doc.addPage();

      // Process each order
      orders.forEach((order, index) => {
        // Add a new page for each order (except the first one)
        if (index > 0) {
          doc.addPage();
        }
        
        // Generate invoice for current order
        generateInvoicePage(doc, order);
      });

      // End the document only once after all pages are added
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const generateInvoicePage = (doc, order) => {
  try {
    let companyDetails, logoPath;

    if (order.companyName === 'Shreyans') {
      companyDetails = {
        name: 'Shreyans Retail Solution',
        address: 'FLOOR: 3.B, B-320, Sussex Industrial Estate,',
        address2: 'GHODAPDEO, BYCULLA EAST MUMBAI',
        phone: 'Phone no.: 9324776246',
        email: 'Email: shreyanspos@gmail.com',
        gstin: 'GSTIN : 27ANOPJ5618C1ZZ',
        state: 'State: 27-Maharashtra'
      };
      logoPath = './public/images/shreyans_logo.png';
    } else {
      companyDetails = {
        name: 'POSIFLOW RETAIL PRIVATE LIMITED',
        address: 'FLOOR: 3.B, B-320, Sussex Industrial Estate,',
        address2: 'GHODAPDEO, BYCULLA EAST MUMBAI',
        phone: 'Phone no.: 8655966739',
        email: 'Email: POSIFLOW.IN@GMAIL.COM',
        gstin: 'GSTIN : 27AAOCP1889K1ZL',
        state: 'State: 27-Maharashtra'
      };
      logoPath = './public/images/posiflow_logo.png';
    }

    // Header
    doc.image(logoPath, 400, 50, { width: 100 });
    doc.font('Helvetica-Bold').fontSize(16).text(companyDetails.name, 50, 50);
    doc.font('Helvetica').fontSize(10).text(companyDetails.address, 50, 70);
    doc.text(companyDetails.address2, 50, 85);
    doc.text(companyDetails.phone, 50, 100);
    doc.text(companyDetails.email, 50, 115);
    doc.text(companyDetails.gstin, 50, 130);
    doc.text(companyDetails.state, 50, 145);

    // Divider
    doc.moveTo(50, 160).lineTo(550, 160).stroke();

    // Title
    doc.font('Helvetica-Bold').fontSize(20).text('Tax Invoice', 0, 170, { align: 'center' });

// Columns
      const column1 = 50;
      const column2 = 210;
      const column3 = 400;
      let y = 200;

      const billing = order.billingAddress;
      const shipping = order.shippingAddress;

      const isSameAddress =
        billing.street === shipping.street &&
        billing.city === shipping.city &&
        billing.state === shipping.state &&
        billing.postalCode === shipping.postalCode;
      if(isSameAddress){
          doc.font('Helvetica-Bold').fontSize(12).text('Bill & Ship To', column1, y, { underline: true });
      }else{
          doc.font('Helvetica-Bold').fontSize(12).text('Bill To', column1, y, { underline: true });
      }
      doc.font('Helvetica').fontSize(10);
      let yOffset = y + 20;
      doc.text(order.customerName, column1, yOffset);
      yOffset += 15;

      if (order.customerGSTIN) {
        doc.text(`GSTIN: ${order.customerGSTIN}`, column1, yOffset);
        yOffset += 15;
      }

      doc.text(`Contact: ${order.customerContact}`, column1, yOffset);
      yOffset += 15;
      yOffset = wrapText(doc, billing.street, column1, yOffset, 150);
      yOffset = wrapText(doc, `${billing.city}, ${billing.state}`, column1, yOffset, 230);
      doc.text(`Pincode: ${billing.postalCode}`, column1, yOffset);
      yOffset += 15;

      let rightColumnY = y;

      if (!isSameAddress) {
        doc.font('Helvetica-Bold').fontSize(12).text('Ship To', column2, y, { underline: true });
        doc.font('Helvetica').fontSize(10);

        let shipY = y + 20;
        doc.text(order.customerName, column2, shipY);
        shipY += 15;
        shipY = wrapText(doc, shipping.street, column2, shipY, 200);
        shipY = wrapText(doc, `${shipping.city}, ${shipping.state}`, column2, shipY, 200);
        doc.text(`Pincode: ${shipping.postalCode}`, column2, shipY);
        shipY += 15;
        doc.text(`Contact: ${order.customerContact}`, column2, shipY);
        rightColumnY = Math.max(rightColumnY, shipY + 15);
      // } else {
        // doc.font('Helvetica-Bold').fontSize(12).text('Shipping Address Same as Billing', column2, y);
      }

      const invoiceColumnX = isSameAddress ? column3 : column3;
      const invoiceStartY = y;
      doc.font('Helvetica-Bold').fontSize(12).text('Invoice Details', invoiceColumnX, invoiceStartY, { underline: true });
      doc.font('Helvetica').fontSize(10).text(`Invoice No: ${order.orderReference || 'N/A'}`, invoiceColumnX, invoiceStartY + 20);
      doc.text(`Date: ${order.createdAt.toLocaleDateString()}`, invoiceColumnX, invoiceStartY + 35);
      doc.text(`Sales Person: ${order.salesPerson?.name || 'N/A'}`, invoiceColumnX, invoiceStartY + 50);

      // Table Header
      let yTable = Math.max(yOffset, rightColumnY) + 30;
      const rowHeight = 25;
      doc.moveTo(50, yTable).lineTo(560, yTable).stroke();

      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Sr No', 50, yTable + 5);
      doc.text('Product Name', 85, yTable + 5, { width: 200 });
      doc.text('Qty', 240, yTable + 5, { width: 40, align: 'right' });
      doc.text('Unit Price', 300, yTable + 5, { width: 60, align: 'right' });
      doc.text('Tax', 360, yTable + 5, { width: 60, align: 'right' });
      doc.text('Subtotal', 430, yTable + 5, { width: 60, align: 'right' }); // Added Subtotal column
      doc.text('Amount', 460, yTable + 5, { width: 90, align: 'right' }); // Adjusted position

      yTable += rowHeight;

      let totalAmount = 0, totalQuantity = 0, totalTax = 0, totalSubtotal = 0;
      doc.font('Helvetica');

      order.items.forEach((item, index) => {
        const itemAmount = item.price * item.quantity;
        const taxRate = order.taxRate || 3; // fallback to 3% if not present
        const exclusiveAmount = itemAmount / (1 + taxRate / 100);
        const taxAmount = itemAmount - exclusiveAmount;
        const subtotalAmount = itemAmount - taxAmount;

        doc.text(`${index + 1}`, 50, yTable + 5);
        doc.text(item.productName, 85, yTable + 5, { width: 200 });
        doc.text(item.quantity.toString(), 240, yTable + 5, { width: 40, align: 'right' });
        doc.text(item.price.toFixed(2), 300, yTable + 5, { width: 60, align: 'right' });
        
        // Tax amount
        doc.text(`${taxAmount.toFixed(2)} (${taxRate}%)`, 360, yTable + 5, { width: 60, align: 'right' });

        // Subtotal amount (exclusive of tax)
        doc.text(subtotalAmount.toFixed(2), 430, yTable + 5, { width: 60, align: 'right' });

        // Total amount (inclusive of tax)
        doc.text(itemAmount.toFixed(2), 460, yTable + 5, { width: 90, align: 'right' });

        doc.moveTo(50, yTable).lineTo(560, yTable).strokeColor('#cccccc').stroke();

        totalAmount += itemAmount;
        totalQuantity += item.quantity;
        totalTax += taxAmount;
        totalSubtotal += subtotalAmount;
        yTable += rowHeight;
      });

      // Add totals row
      yTable += 10;
      doc.font('Helvetica-Bold');
      doc.text('Total:', 300, yTable + 5, { width: 60, align: 'right' });
      doc.text(totalQuantity.toString(), 240, yTable + 5, { width: 40, align: 'right' });
      doc.text('', 410, yTable + 5, { width: 60, align: 'right' }); // Empty for tax column
      doc.text(totalTax.toFixed(2), 360, yTable + 5, { width: 60, align: 'right' }); // Total tax
      doc.text(totalSubtotal.toFixed(2), 430, yTable + 5, { width: 60, align: 'right' }); // Total subtotal
      doc.text(totalAmount.toFixed(2), 460, yTable + 5, { width: 90, align: 'right' }); // Total amount
      doc.moveTo(50, yTable).lineTo(560, yTable).strokeColor('#000000').stroke();
      // Footer
      const footerLeft = 50;
      const footerRight = 350;
      let footerStartY = yTable + 30;

      // Calculate accountant description height first
      if (order.accountantDescription) {
        doc.font('Helvetica-Bold').text('Accountant Note:', footerLeft, footerStartY);

        const cleanAccountantDescription = order.accountantDescription.replace(/[\r\n]+/g, ' ').trim();

        const accountantNoteHeight = doc
          .font('Helvetica')
          .heightOfString(cleanAccountantDescription, { width: 250 });

        doc.font('Helvetica').text(cleanAccountantDescription, footerLeft, footerStartY + 15, { width: 250 });

        footerStartY += Math.max(accountantNoteHeight + 30, 50);
      }
      
      // Calculate notes height first
      if (order.notes) {
        doc.font('Helvetica-Bold').text('Description:', footerLeft, footerStartY);

        // Clean up the note: replace \n and \r with space
        const cleanNotes = order.notes.replace(/[\r\n]+/g, ' ').trim();

        // Measure the height of the cleaned notes
        const notesHeight = doc
          .font('Helvetica')
          .heightOfString(cleanNotes, { width: 250 });

        // Draw the cleaned note
        doc.font('Helvetica').text(cleanNotes, footerLeft, footerStartY + 15, { width: 250 });

        // Adjust spacing
        footerStartY += Math.max(notesHeight + 30, 50);
      }


      const amountInWords = numberToWords(Math.floor(order.total)) + ' Rupees only';
      doc.font('Helvetica-Bold').text('Invoice Amount In Words:', footerLeft, footerStartY);

      // Measure amount in words height
      const amountHeight = doc
        .font('Helvetica')
        .heightOfString(amountInWords, { width: 250 });
        
      doc.font('Helvetica').text(amountInWords, footerLeft, footerStartY + 15, { width: 250 });
      footerStartY += Math.max(amountHeight + 30, 45); // Keep minimum 45px gap

      doc.font('Helvetica-Bold').text('Terms and Conditions:', footerLeft, footerStartY);
      doc.font('Helvetica').text('Thanks for doing business with us!', footerLeft, footerStartY + 15);

      // Summary section - adjust starting position if needed
      let summaryY = Math.max(footerStartY - 30, yTable - 150); // Ensure minimum spacing
      // Summary
      const summaryX = footerRight;
      // let summaryY = footerStartY;

      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Sub Total:', summaryX, summaryY, { width: 100, align: 'right' });
      doc.font('Helvetica').text(order.subtotal.toFixed(2), summaryX + 110, summaryY, { width: 80, align: 'right' });

      summaryY += 20;
      doc.font('Helvetica-Bold')
   .text('Tax (' + order.taxRate + '%)', summaryX, summaryY, { width: 100, align: 'right' });

      doc.font('Helvetica').text(order.tax.toFixed(2), summaryX + 110, summaryY, { width: 80, align: 'right' });

      summaryY += 20;
      doc.moveTo(summaryX, summaryY).lineTo(summaryX + 200, summaryY).stroke();

      summaryY += 10;
      doc.font('Helvetica-Bold').text('Total:', summaryX, summaryY, { width: 100, align: 'right' });
      doc.text(order.total.toFixed(2), summaryX + 110, summaryY, { width: 80, align: 'right' });

      // ✅ Advance Payment section (if any)
      if (order.advancePayment && order.advancePayment > 0) {
        summaryY += 20;
        doc.font('Helvetica-Bold').text('Advance Paid:', summaryX, summaryY, { width: 100, align: 'right' });
        doc.font('Helvetica').text(order.advancePayment.toFixed(2), summaryX + 110, summaryY, { width: 80, align: 'right' });
      }

      summaryY += 20;
      doc.moveTo(summaryX, summaryY).lineTo(summaryX + 200, summaryY).stroke();

      summaryY += 10;
      doc.font('Helvetica-Bold').text('Payment Mode:', summaryX - 80, summaryY, { width: 100, align: 'right' });
      doc.font('Helvetica').text(order.paymentMode || 'N/A', summaryX + 22, summaryY, { width: 180, align: 'left' });

      if (order.cashSubOption) {
        summaryY += 20;
        doc.font('Helvetica-Bold').text('Sub Option:', summaryX, summaryY, { width: 100, align: 'right' });
        doc.font('Helvetica').text(order.cashSubOption, summaryX + 110, summaryY, { width: 80, align: 'right' });
      }
    // // Footer
    // const signatureY = doc.y + 50;
    // doc.text(`For: ${companyDetails.name}`, 350, signatureY);
    // doc.moveTo(450, signatureY + 30).lineTo(550, signatureY + 30).stroke();
    // doc.text('Authorized Signatory', 470, signatureY + 35);

  } catch (error) {
    console.error('Error generating invoice for order:', order.orderReference, error);
    // Add error page
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(16).text(`Error generating invoice for order ${order.orderReference}`, 50, 50);
    doc.font('Helvetica').text(error.message, 50, 80);
  }
};


const generateInvoice = (order) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      let companyDetails, logoPath;

      if (order.companyName === 'Shreyans') {
        companyDetails = {
          name: 'Shreyans Retail Solution',
          address: 'FLOOR: 3.B, B-320, Sussex Industrial Estate,',
          address2: 'GHODAPDEO, BYCULLA EAST MUMBAI',
          phone: 'Phone no.: 9324776246',
          email: 'Email: shreyanspos@gmail.com',
          gstin: 'GSTIN : 27ANOPJ5618C1ZZ',
          state: 'State: 27-Maharashtra'
        };
        logoPath = './public/images/shreyans_logo.png';
      } else {
        companyDetails = {
          name: 'POSIFLOW RETAIL PRIVATE LIMITED',
          address: 'FLOOR: 3.B, B-320, Sussex Industrial Estate,',
          address2: 'GHODAPDEO, BYCULLA EAST MUMBAI',
          phone: 'Phone no.: 8655966739',
          email: 'Email: POSIFLOW.IN@GMAIL.COM',
          gstin: 'GSTIN : 27AAOCP1889K1ZL',
          state: 'State: 27-Maharashtra'
        };
        logoPath = './public/images/posiflow_logo.png';
      }

      // Header
      doc.image(logoPath, 400, 50, { width: 100 });
      doc.font('Helvetica-Bold').fontSize(16).text(companyDetails.name, 50, 50);
      doc.font('Helvetica').fontSize(10).text(companyDetails.address, 50, 70);
      doc.text(companyDetails.address2, 50, 85);
      doc.text(companyDetails.phone, 50, 100);
      doc.text(companyDetails.email, 50, 115);
      doc.text(companyDetails.gstin, 50, 130);
      doc.text(companyDetails.state, 50, 145);

      // Divider
      doc.moveTo(50, 160).lineTo(550, 160).stroke();

      // Title
      doc.font('Helvetica-Bold').fontSize(20).text('Tax Invoice', 0, 170, { align: 'center' });

      // Columns
      const column1 = 50;
      const column2 = 210;
      const column3 = 400;
      let y = 200;

      const billing = order.billingAddress;
      const shipping = order.shippingAddress;

      const isSameAddress =
        billing.street === shipping.street &&
        billing.city === shipping.city &&
        billing.state === shipping.state &&
        billing.postalCode === shipping.postalCode;
      if(isSameAddress){
          doc.font('Helvetica-Bold').fontSize(12).text('Bill & Ship To', column1, y, { underline: true });
      }else{
          doc.font('Helvetica-Bold').fontSize(12).text('Bill To', column1, y, { underline: true });
      }
      doc.font('Helvetica').fontSize(10);
      let yOffset = y + 20;
      doc.text(order.customerName, column1, yOffset);
      yOffset += 15;

      if (order.customerGSTIN) {
        doc.text(`GSTIN: ${order.customerGSTIN}`, column1, yOffset);
        yOffset += 15;
      }

      doc.text(`Contact: ${order.customerContact}`, column1, yOffset);
      yOffset += 15;
      yOffset = wrapText(doc, billing.street, column1, yOffset, 150);
      yOffset = wrapText(doc, `${billing.city}, ${billing.state}`, column1, yOffset, 230);
      doc.text(`Pincode: ${billing.postalCode}`, column1, yOffset);
      yOffset += 15;

      let rightColumnY = y;

      if (!isSameAddress) {
        doc.font('Helvetica-Bold').fontSize(12).text('Ship To', column2, y, { underline: true });
        doc.font('Helvetica').fontSize(10);

        let shipY = y + 20;
        doc.text(order.customerName, column2, shipY);
        shipY += 15;
        shipY = wrapText(doc, shipping.street, column2, shipY, 200);
        shipY = wrapText(doc, `${shipping.city}, ${shipping.state}`, column2, shipY, 200);
        doc.text(`Pincode: ${shipping.postalCode}`, column2, shipY);
        shipY += 15;
        doc.text(`Contact: ${order.customerContact}`, column2, shipY);
        rightColumnY = Math.max(rightColumnY, shipY + 15);
      // } else {
        // doc.font('Helvetica-Bold').fontSize(12).text('Shipping Address Same as Billing', column2, y);
      }

      const invoiceColumnX = isSameAddress ? column3 : column3;
      const invoiceStartY = y;
      doc.font('Helvetica-Bold').fontSize(12).text('Invoice Details', invoiceColumnX, invoiceStartY, { underline: true });
      doc.font('Helvetica').fontSize(10).text(`Invoice No: ${order.orderReference || 'N/A'}`, invoiceColumnX, invoiceStartY + 20);
      doc.text(`Date: ${order.createdAt.toLocaleDateString()}`, invoiceColumnX, invoiceStartY + 35);
      doc.text(`Sales Person: ${order.salesPerson?.name || 'N/A'}`, invoiceColumnX, invoiceStartY + 50);

      // Table Header
      let yTable = Math.max(yOffset, rightColumnY) + 30;
      const rowHeight = 25;
      doc.moveTo(50, yTable).lineTo(550, yTable).stroke();

      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Sr No', 55, yTable + 5);
      doc.text('Product Name', 100, yTable + 5, { width: 200 });
      doc.text('Qty', 310, yTable + 5, { width: 40, align: 'right' });
      doc.text('Unit Price', 370, yTable + 5, { width: 60, align: 'right' });
      doc.text('Amount', 450, yTable + 5, { width: 90, align: 'right' });

      yTable += rowHeight;

      let totalAmount = 0, totalQuantity = 0;
      doc.font('Helvetica');

      order.items.forEach((item, index) => {
        const itemAmount = item.price * item.quantity;

        doc.text(`${index + 1}`, 55, yTable + 5);
        doc.text(item.productName, 100, yTable + 5, { width: 200 });
        doc.text(item.quantity.toString(), 310, yTable + 5, { width: 40, align: 'right' });
        doc.text(item.price.toFixed(2), 370, yTable + 5, { width: 60, align: 'right' });
        doc.text(itemAmount.toFixed(2), 450, yTable + 5, { width: 90, align: 'right' });

        doc.moveTo(50, yTable).lineTo(550, yTable).strokeColor('#cccccc').stroke();

        totalAmount += itemAmount;
        totalQuantity += item.quantity;
        yTable += rowHeight;
      });

      // Totals
      doc.moveTo(50, yTable).lineTo(550, yTable).strokeColor('black').stroke();
      doc.font('Helvetica-Bold');
      doc.text('Total', 100, yTable + 5);
      doc.text(totalQuantity.toString(), 310, yTable + 5, { width: 40, align: 'right' });
      doc.text('', 370, yTable + 5);
      doc.text(totalAmount.toFixed(2), 450, yTable + 5, { width: 90, align: 'right' });

      // Footer
      const footerLeft = 50;
      const footerRight = 350;
      let footerStartY = yTable + 30;

      // Calculate notes height first
      if (order.notes) {
        doc.font('Helvetica-Bold').text('Description:', footerLeft, footerStartY);

        // Clean up the note: replace \n and \r with space
        const cleanNotes = order.notes.replace(/[\r\n]+/g, ' ').trim();

        // Measure the height of the cleaned notes
        const notesHeight = doc
          .font('Helvetica')
          .heightOfString(cleanNotes, { width: 250 });

        // Draw the cleaned note
        doc.font('Helvetica').text(cleanNotes, footerLeft, footerStartY + 15, { width: 250 });

        // Adjust spacing
        footerStartY += Math.max(notesHeight + 30, 50);
      }


      const amountInWords = numberToWords(Math.floor(order.total)) + ' Rupees only';
      doc.font('Helvetica-Bold').text('Invoice Amount In Words:', footerLeft, footerStartY);

      // Measure amount in words height
      const amountHeight = doc
        .font('Helvetica')
        .heightOfString(amountInWords, { width: 250 });
        
      doc.font('Helvetica').text(amountInWords, footerLeft, footerStartY + 15, { width: 250 });
      footerStartY += Math.max(amountHeight + 30, 45); // Keep minimum 45px gap

      doc.font('Helvetica-Bold').text('Terms and Conditions:', footerLeft, footerStartY);
      doc.font('Helvetica').text('Thanks for doing business with us!', footerLeft, footerStartY + 15);

      // Summary section - adjust starting position if needed
      let summaryY = Math.max(footerStartY - 30, yTable - 150); // Ensure minimum spacing
      // Summary
      const summaryX = footerRight;
      // let summaryY = footerStartY;

      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Sub Total:', summaryX, summaryY, { width: 100, align: 'right' });
      doc.font('Helvetica').text(order.subtotal.toFixed(2), summaryX + 110, summaryY, { width: 80, align: 'right' });

      summaryY += 20;
      doc.font('Helvetica-Bold')
   .text('Tax (' + order.taxRate + '%)', summaryX, summaryY, { width: 100, align: 'right' });

      doc.font('Helvetica').text(order.tax.toFixed(2), summaryX + 110, summaryY, { width: 80, align: 'right' });

      summaryY += 20;
      doc.moveTo(summaryX, summaryY).lineTo(summaryX + 200, summaryY).stroke();

      summaryY += 10;
      doc.font('Helvetica-Bold').text('Total:', summaryX, summaryY, { width: 100, align: 'right' });
      doc.text(order.total.toFixed(2), summaryX + 110, summaryY, { width: 80, align: 'right' });

      // ✅ Advance Payment section (if any)
      if (order.advancePayment && order.advancePayment > 0) {
        summaryY += 20;
        doc.font('Helvetica-Bold').text('Advance Paid:', summaryX, summaryY, { width: 100, align: 'right' });
        doc.font('Helvetica').text(order.advancePayment.toFixed(2), summaryX + 110, summaryY, { width: 80, align: 'right' });
      }

      summaryY += 20;
      doc.moveTo(summaryX, summaryY).lineTo(summaryX + 200, summaryY).stroke();

      summaryY += 10;
      doc.font('Helvetica-Bold').text('Payment Mode:', summaryX - 80, summaryY, { width: 100, align: 'right' });
      doc.font('Helvetica').text(order.paymentMode || 'N/A', summaryX + 22, summaryY, { width: 180, align: 'left' });

      if (order.cashSubOption) {
        summaryY += 20;
        doc.font('Helvetica-Bold').text('Sub Option:', summaryX, summaryY, { width: 100, align: 'right' });
        doc.font('Helvetica').text(order.cashSubOption, summaryX + 110, summaryY, { width: 80, align: 'right' });
      }

      // Signature
      const signatureY = Math.max(summaryY, footerStartY + 130);
      doc.text(`For: ${companyDetails.name}`, footerRight, signatureY);
      doc.moveTo(footerRight + 100, signatureY + 30).lineTo(footerRight + 200, signatureY + 30).stroke();
      doc.text('Authorized Signatory', footerRight + 120, signatureY + 35);

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateInvoice, generateBulkInvoices };

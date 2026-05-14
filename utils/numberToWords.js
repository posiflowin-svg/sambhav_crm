// utils/numberToWords.js
const numberToWords = (num) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  function convertLessThanOneThousand(num) {
    if (num === 0) return '';
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) {
      return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
    }
    return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + convertLessThanOneThousand(num % 100) : '');
  }

  if (num === 0) return 'Zero';
  let result = '';
  
  // Handle rupees and paise if needed
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  
  if (rupees >= 10000000) {
    result += convertLessThanOneThousand(Math.floor(rupees / 10000000)) + ' Crore ';
    num %= 10000000;
  }
  if (rupees >= 100000) {
    result += convertLessThanOneThousand(Math.floor(rupees / 100000)) + ' Lakh ';
    num %= 100000;
  }
  if (rupees >= 1000) {
    result += convertLessThanOneThousand(Math.floor(rupees / 1000)) + ' Thousand ';
    num %= 1000;
  }
  result += convertLessThanOneThousand(rupees);
  
  if (paise > 0) {
    result += ' and ' + convertLessThanOneThousand(paise) + ' Paise';
  }
  
  return result.trim();
};

module.exports = { numberToWords };
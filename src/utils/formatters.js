/**
 * Utility functions for formatting dates and currency amounts consistently across the app.
 */

/**
 * Formats a date string (YYYY-MM-DD) into DD-MM-YYYY format.
 * @param {string} dateStr 
 * @returns {string}
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return dateStr;
  }
};

/**
 * Formats a numerical amount based on the currency's decimal precision.
 * @param {number|string} amount 
 * @param {string} currencyCode 
 * @param {Array} currencies - List of currency objects with decimals property
 * @returns {string}
 */
export const formatAmount = (amount, currencyCode, currencies = []) => {
  const decimals = getCurrencyDecimals(currencyCode, currencies);
  return (parseFloat(amount) || 0).toFixed(decimals);
};

/**
 * Gets the number of decimals for a currency.
 * @param {string} currencyCode 
 * @param {Array} currencies 
 * @returns {number}
 */
export const getCurrencyDecimals = (currencyCode, currencies = []) => {
  const curr = (currencies || []).find(c => c.code === currencyCode);
  return curr ? curr.decimals : (currencyCode === 'OMR' ? 3 : 2);
};

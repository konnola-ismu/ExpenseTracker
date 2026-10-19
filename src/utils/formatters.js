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
    const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (isNaN(d.getTime())) return typeof dateStr === 'string' ? dateStr : '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return typeof dateStr === 'string' ? dateStr : '';
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

/**
 * Compares two semantic or dotted version numbers (e.g. "1.10.16.2" vs "1.10.2.6").
 * @param {string} v1 
 * @param {string} v2 
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2
 */
export const compareVersions = (v1, v2) => {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const cleanV1 = String(v1).replace(/^v/i, '').trim();
  const cleanV2 = String(v2).replace(/^v/i, '').trim();
  const parts1 = cleanV1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = cleanV2.split('.').map(n => parseInt(n, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
};


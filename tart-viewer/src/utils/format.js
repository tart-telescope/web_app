/**
 * Utility functions for formatting various data types
 */

/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes) {
  if (!bytes) {
return "0 B";
}
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (
    Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i]
  );
}

/**
 * Format date to localized date and time string
 * @param {Date|string} date - Date object or date string
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) {
return "";
}
  const d = new Date(date);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

/**
 * Format date to relative time ago string
 * @param {Date|string} date - Date object or date string
 * @returns {string} Relative time string (e.g., "2h ago", "3d ago")
 */
export function formatTimeAgo(date) {
  if (!date) {
return "";
}
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 60) {
return `${minutes}m ago`;
}
  if (hours < 24) {
return `${hours}h ago`;
}
  if (days < 30) {
return `${days}d ago`;
}
  return new Date(date).toLocaleDateString();
}

/**
 * Format date to localized date only (no time)
 * @param {Date|string} date - Date object or date string
 * @returns {string} Formatted date string
 */
export function formatDateOnly(date) {
  if (!date) {
return "";
}
  return new Date(date).toLocaleDateString();
}

/**
 * Format number with thousands separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
  if (num == null) {
return "";
}
  return num.toLocaleString();
}

/**
 * Format percentage with specified decimal places
 * @param {number} value - Value to format as percentage (0-1 range)
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value, decimals = 1) {
  if (value == null) {
return "";
}
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format duration in milliseconds to human readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms) {
  if (ms == null) {
return "";
}
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
return `${days}d ${hours % 24}h`;
}
  if (hours > 0) {
return `${hours}h ${minutes % 60}m`;
}
  if (minutes > 0) {
return `${minutes}m ${seconds % 60}s`;
}
  return `${seconds}s`;
}

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: 'USD')
 * @param {string} locale - Locale for formatting (default: 'en-US')
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  if (amount == null) {
return "";
}
  return new Intl.NumberFormatter(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default: 50)
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 50) {
  if (!text) {
return "";
}
  if (text.length <= maxLength) {
return text;
}
  return text.slice(0, maxLength - 3) + "...";
}
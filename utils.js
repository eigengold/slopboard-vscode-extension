const vscode = require("vscode");
const crypto = require("crypto");

/**
 * Utility functions for the Slopboard Tracker extension
 */
class Utils {
  /**
   * Securely store an API key in the configuration
   * @param {string} key - The API key to store
   * @returns {Promise} - Resolves when the key is stored
   */
  static async storeApiKey(key) {
    // In a real extension, consider using a more secure storage mechanism
    // For simplicity, we're just storing it in settings
    const config = vscode.workspace.getConfiguration("slopboardTracker");
    await config.update("apiKey", key, true);
  }

  /**
   * Get the API key from configuration
   * @returns {string|null} - The API key or null if not set
   */
  static getApiKey() {
    const config = vscode.workspace.getConfiguration("slopboardTracker");
    return config.get("apiKey");
  }

  /**
   * Check if tracking is enabled
   * @returns {boolean} - True if tracking is enabled
   */
  static isTrackingEnabled() {
    const config = vscode.workspace.getConfiguration("slopboardTracker");
    return config.get("enabled", true);
  }

  /**
   * Get the idle threshold in seconds
   * @returns {number} - Idle threshold in seconds
   */
  static getIdleThreshold() {
    const config = vscode.workspace.getConfiguration("slopboardTracker");
    return config.get("idleThreshold", 120);
  }

  /**
   * Format a duration in seconds to a human-readable string
   * @param {number} seconds - Duration in seconds
   * @returns {string} - Formatted duration string
   */
  static formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${remainingMinutes}m`;
    }
  }

  /**
   * Generate a hash from a string
   * @param {string} str - The string to hash
   * @returns {string} - The hashed string
   */
  static generateHash(str) {
    return crypto.createHash("sha256").update(str).digest("hex");
  }

  /**
   * Get the start of a week for a given date
   * @param {Date} date - The date
   * @returns {Date} - The first day of the week (Monday)
   */
  static getWeekStart(date) {
    const result = new Date(date);
    const day = result.getDay();

    // If Sunday (0), adjust to previous Monday (-6 days)
    // Otherwise, get the previous Monday
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);

    return result;
  }

  /**
   * Get the end of a week for a given date
   * @param {Date} date - The date
   * @returns {Date} - The last day of the week (Sunday)
   */
  static getWeekEnd(date) {
    const result = this.getWeekStart(date);
    result.setDate(result.getDate() + 6);
    result.setHours(23, 59, 59, 999);

    return result;
  }

  /**
   * Get week boundaries for a given date
   * @param {Date} date - The date
   * @returns {Object} - Object with start and end dates
   */
  static getWeekBoundaries(date) {
    return {
      start: this.getWeekStart(date),
      end: this.getWeekEnd(date),
    };
  }

  /**
   * Check if a date is within a specific week
   * @param {Date} target - Date to check
   * @param {Date} weekOf - Date within the week to check against
   * @returns {boolean} - True if the target date is in the same week
   */
  static isInSameWeek(target, weekOf) {
    const targetStart = this.getWeekStart(target);
    const weekStart = this.getWeekStart(weekOf);

    return targetStart.getTime() === weekStart.getTime();
  }
}

module.exports = Utils;

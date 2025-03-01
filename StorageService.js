const vscode = require('vscode');

/**
 * Storage service for managing extension data
 */
class StorageService {
  constructor() {
    this.context = null;
  }
  
  /**
   * Set the extension context
   * @param {vscode.ExtensionContext} context
   */
  setContext(context) {
    this.context = context;
  }
  
  /**
   * Add a session to the offline storage
   * @param {Object} session - The session to store
   */
  async addOfflineSession(session) {
    try {
      const offlineSessions = this.getOfflineSessions();
      offlineSessions.push({
        id: session.id,
        language: session.language,
        // Convert Date objects to ISO strings for storage
        startTime: session.startTime instanceof Date ? session.startTime.toISOString() : session.startTime,
        endTime: session.endTime instanceof Date ? session.endTime.toISOString() : session.endTime,
        duration: session.duration
      });
      
      await this.context.globalState.update('offlineSessions', offlineSessions);
      this.maybeTriggerOfflineWarning(offlineSessions.length);
    } catch (error) {
      console.error('Failed to store offline session:', error);
    }
  }
  
  /**
   * Get all offline sessions
   * @param {number} limit - Optional limit on number of sessions to return
   * @returns {Array} - Array of offline sessions
   */
  getOfflineSessions(limit = Infinity) {
    const sessions = this.context.globalState.get('offlineSessions', []);
    return limit < Infinity ? sessions.slice(0, limit) : sessions;
  }
  
  /**
   * Check if there are any offline sessions
   * @returns {boolean} - True if there are offline sessions
   */
  hasOfflineSessions() {
    return this.getOfflineSessionCount() > 0;
  }
  
  /**
   * Get the number of offline sessions
   * @returns {number} - Number of offline sessions
   */
  getOfflineSessionCount() {
    return this.context.globalState.get('offlineSessions', []).length;
  }
  
  /**
   * Remove a number of offline sessions from the start of the queue
   * @param {number} count - Number of sessions to remove
   */
  async removeOfflineSessions(count) {
    try {
      const offlineSessions = this.getOfflineSessions();
      const remainingSessions = offlineSessions.slice(count);
      await this.context.globalState.update('offlineSessions', remainingSessions);
    } catch (error) {
      console.error('Failed to remove offline sessions:', error);
    }
  }
  
  /**
   * Maybe show a warning if too many offline sessions accumulate
   * @param {number} count - Current count of offline sessions
   */
  maybeTriggerOfflineWarning(count) {
    const thresholds = [10, 50, 100, 500];
    if (thresholds.includes(count)) {
      vscode.window.showWarningMessage(
        `You have ${count} coding sessions stored offline. Please check your internet connection.`
      );
    }
  }
  
  /**
   * Cache languages for offline use
   * @param {Array} languages - Array of language objects
   */
  async cacheLanguages(languages) {
    try {
      await this.context.globalState.update('cachedLanguages', languages);
    } catch (error) {
      console.error('Failed to cache languages:', error);
    }
  }
  
  /**
   * Get cached languages
   * @returns {Array|null} - Array of language objects or null if not cached
   */
  getLanguageCache() {
    return this.context.globalState.get('cachedLanguages', null);
  }
  
  /**
   * Clear all cached data
   */
  async clearCache() {
    try {
      await this.context.globalState.update('offlineSessions', []);
      await this.context.globalState.update('cachedLanguages', null);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
}

module.exports = new StorageService();
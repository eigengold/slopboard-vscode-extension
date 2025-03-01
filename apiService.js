const axios = require("axios");
const vscode = require("vscode");

/**
 * @typedef {Object} SessionData
 * @property {number} language_id - The ID of the programming language
 * @property {string} start_time - ISO timestamp of session start
 * @property {string} end_time - ISO timestamp of session end
 * @property {number} duration - Duration in seconds
 * @property {string} [project_name] - Optional project name
 * @property {string} [file_path] - Optional file path
 */

/**
 * API service for communicating with the time tracker backend
 */
class ApiService {
  constructor() {
    // Get API URL from configuration or use production default
    this.baseUrl = vscode.workspace
      .getConfiguration("slopboardTracker")
      .get("apiUrl", "https://slopboard.dev/api");

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });

    // Set up request interceptor for authentication
    this.axiosInstance.interceptors.request.use((config) => {
      const apiKey = vscode.workspace
        .getConfiguration("slopboardTracker")
        .get("apiKey");
      if (apiKey) {
        config.headers["Authorization"] = `Bearer ${apiKey}`;
      }
      return config;
    });

    // Set up response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        // Check if the request was made and the server responded
        if (error.response) {
          const errorData = error.response.data;
          const errorMessage = this.getErrorMessage(errorData);

          // Handle specific error codes
          switch (error.response.status) {
            case 400:
              vscode.window.showErrorMessage(`Bad request: ${errorMessage}`);
              break;
            case 401:
              vscode.window.showErrorMessage(
                "API key is invalid or expired. Please update your API key."
              );
              break;
            case 429:
              // Rate limiting - we should back off and retry
              return new Promise((resolve) => {
                setTimeout(
                  () => resolve(this.axiosInstance(error.config)),
                  5000
                );
              });
            case 500:
              console.error("Server error details:", {
                data: error.response.data,
                status: error.response.status,
                headers: error.response.headers,
                requestData: error.config.data,
              });

              // Check for specific database errors
              if (errorData?.code === "42501") {
                vscode.window.showErrorMessage(
                  "Permission denied: Your API key does not have permission to record coding sessions. Please check your API key permissions."
                );
              } else {
                vscode.window.showErrorMessage(
                  `Internal server error: ${errorMessage}`
                );
              }
              break;
            default:
              console.error(
                `HTTP Error ${error.response.status}:`,
                error.response.data
              );
              vscode.window.showErrorMessage(`Server error: ${errorMessage}`);
              break;
          }
        } else if (error.request) {
          // The request was made but no response was received
          console.error("Network error:", error.message);
          vscode.window.showWarningMessage(
            "Network error. Sessions will be saved locally and synced when connection is restored."
          );
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get the API URL from configuration
   * @returns {string} - The configured API URL
   */
  getApiUrl() {
    return vscode.workspace
      .getConfiguration("slopboardTracker")
      .get("apiUrl", "https://slopboard.dev/api");
  }

  /**
   * Update the base URL if it changes in configuration
   */
  updateBaseUrl() {
    const newBaseUrl = this.getApiUrl();
    if (newBaseUrl !== this.baseUrl) {
      this.baseUrl = newBaseUrl;
      this.axiosInstance.defaults.baseURL = this.baseUrl;
    }
  }

  /**
   * Extract a user-friendly error message from the error response
   * @param {Object} errorData - The error response data
   * @returns {string} - A user-friendly error message
   * @private
   */
  getErrorMessage(errorData) {
    if (!errorData) return "An unknown error occurred";

    // Handle PostgreSQL error format
    if (errorData.code && errorData.message) {
      return errorData.message;
    }

    // Handle standard error format
    if (errorData.error) {
      return errorData.error;
    }

    // Fallback for unknown error format
    return "An unexpected error occurred";
  }

  /**
   * Send a session to the API
   * @param {SessionData} sessionData - The session data to send
   * @returns {Promise<Object>} - The API response
   */
  async sendSession(sessionData) {
    try {
      // Ensure we have the latest API URL
      this.updateBaseUrl();

      console.log(
        "Sending session data:",
        JSON.stringify(sessionData, null, 2)
      );
      const response = await this.axiosInstance.post(
        "/coding-sessions",
        sessionData
      );
      return response.data;
    } catch (error) {
      console.error("Failed to send session:", error.message);
      if (error.response?.data) {
        console.error("Server response:", error.response.data);
      }
      throw error;
    }
  }

  /**
   * Send multiple sessions to the API in a batch
   * @param {SessionData[]} sessions - Array of session data to send
   * @returns {Promise<{success: boolean, count: number}>} - The API response
   */
  async sendBatchSessions(sessions) {
    try {
      // Ensure we have the latest API URL
      this.updateBaseUrl();

      // Group sessions by language and project to reduce payload size
      const groupedSessions = this.groupSessionsByLanguage(sessions);

      console.log(
        `Sending ${groupedSessions.length} grouped sessions (from ${sessions.length} original sessions)`
      );

      const response = await this.axiosInstance.post("/coding-sessions/batch", {
        sessions: groupedSessions,
      });
      return response.data;
    } catch (error) {
      console.error("Failed to send batch sessions:", error.message);
      if (error.response?.data) {
        console.error("Server response:", error.response.data);
      }
      throw error;
    }
  }

  /**
   * Group sessions by language and week to reduce number of operations
   * @param {SessionData[]} sessions - Original sessions
   * @returns {SessionData[]} - Consolidated sessions
   */
  groupSessionsByLanguage(sessions) {
    if (!sessions || sessions.length === 0) return [];

    // Group sessions by language_id and week
    const sessionMap = new Map();

    for (const session of sessions) {
      const startTime = new Date(session.start_time);
      const weekStart = this.getWeekStart(startTime);
      const key = `${session.language_id}_${weekStart.toISOString()}`;

      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          language_id: session.language_id,
          start_time: weekStart.toISOString(),
          end_time: session.end_time,
          duration: 0,
          project_name: session.project_name || "Unknown",
          file_path: session.file_path || "",
        });
      }

      const group = sessionMap.get(key);
      group.duration += session.duration;

      // Keep track of the latest end time
      const currentEndTime = new Date(group.end_time);
      const newEndTime = new Date(session.end_time);
      if (newEndTime > currentEndTime) {
        group.end_time = session.end_time;
      }
    }

    return Array.from(sessionMap.values());
  }

  /**
   * Get the start of the week for a given date
   * @param {Date} date - The date
   * @returns {Date} - Start of the week (Monday)
   */
  getWeekStart(date) {
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
   * Validate API key
   * @param {string} apiKey - The API key to validate
   * @returns {Promise<{valid: boolean, user_id: string}>} - Validation result
   */
  async validateApiKey(apiKey) {
    try {
      // Ensure we have the latest API URL
      this.updateBaseUrl();

      const response = await this.axiosInstance.get("/auth/validate", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        return { valid: false };
      }
      throw error;
    }
  }

  /**
   * Get language mappings from the API
   * @returns {Promise<Array<{id: number, name: string, color: string}>>} - Array of language objects
   */
  async getLanguages() {
    try {
      // Ensure we have the latest API URL
      this.updateBaseUrl();

      const response = await this.axiosInstance.get("/languages");
      return response.data;
    } catch (error) {
      console.error("Failed to fetch languages:", error);
      // Return a default empty array if we can't fetch languages
      return [];
    }
  }
}

module.exports = new ApiService();

const vscode = require("vscode");
const Utils = require("./utils");

/**
 * WebView provider for showing summary information
 */
class SummaryViewProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.view = null;
    this.activeSession = null;
    this.completedSessions = [];
    this.todaysSessions = [];
    this.weekSessions = [];
  }

  /**
   * Set the active coding session
   * @param {Object|null} session - The active session or null if no active session
   */
  setActiveSession(session) {
    this.activeSession = session;
    this.updateView();
  }

  /**
   * Add a completed session to the history
   * @param {Object} session - The completed session
   */
  addCompletedSession(session) {
    // Add to completed sessions list (limited to 10 for performance)
    this.completedSessions.unshift(session);
    if (this.completedSessions.length > 10) {
      this.completedSessions.pop();
    }

    // Add to today's sessions if applicable
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sessionDate = new Date(session.endTime);

    if (sessionDate >= today) {
      this.todaysSessions.push(session);
    }

    // Add to this week's sessions if applicable
    const weekStart = Utils.getWeekStart(today);
    if (sessionDate >= weekStart) {
      this.weekSessions.push(session);
    }

    this.updateView();
  }

  /**
   * Implement the VS Code webview view provider interface
   * @param {vscode.WebviewView} webviewView - The webview view
   * @param {vscode.WebviewViewResolveContext} context - The context
   * @param {vscode.CancellationToken} token - The cancellation token
   */
  resolveWebviewView(webviewView, context, token) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    this.updateView();

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "refresh":
          this.updateView();
          break;
        case "openSettings":
          vscode.commands.executeCommand("slopboardTracker.viewSettings");
          break;
      }
    });
  }

  /**
   * Update the webview content
   */
  updateView() {
    if (!this.view) return;

    this.view.webview.html = this.getHtmlContent();
  }

  /**
   * Generate HTML content for the webview
   * @returns {string} - HTML content
   */
  getHtmlContent() {
    // Calculate summary data
    const todayTotal = this.calculateTotalDuration(this.todaysSessions);
    const weekTotal = this.calculateTotalDuration(this.weekSessions);

    // Group today's sessions by language
    const languageGroups = this.groupSessionsByLanguage(this.todaysSessions);

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Slopboard Summary</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 10px;
          }
          h2 {
            margin-top: 20px;
            margin-bottom: 10px;
            font-size: 1.2em;
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 5px;
          }
          .summary-item {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
          }
          .language-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;
          }
          .active-session {
            background-color: var(--vscode-editor-selectionBackground);
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 4px;
          }
          .session-item {
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          .session-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          .session-details {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
          }
          .empty-state {
            font-style: italic;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px 0;
          }
          .refresh-btn {
            margin-top: 20px;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 2px;
          }
          .refresh-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .settings-btn {
            margin-top: 5px;
            background: none;
            border: none;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            padding: 0;
            font-size: 0.9em;
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <h2>Summary</h2>
        <div class="summary-item">
          <span>Today</span>
          <span>${Utils.formatDuration(todayTotal)}</span>
        </div>
        <div class="summary-item">
          <span>This Week</span>
          <span>${Utils.formatDuration(weekTotal)}</span>
        </div>
        
        ${
          this.activeSession
            ? `
          <h2>Current Session</h2>
          <div class="active-session">
            <div class="session-header">
              <span>
                <span class="language-dot" style="background-color: ${
                  this.activeSession.language.color
                }"></span>
                ${this.activeSession.language.name}
              </span>
              <span>${this.getSessionDuration(this.activeSession)}</span>
            </div>
          </div>
        `
            : ""
        }
        
        <h2>Today's Languages</h2>
        ${
          languageGroups.length > 0
            ? languageGroups
                .map(
                  (group) => `
            <div class="summary-item">
              <span>
                <span class="language-dot" style="background-color: ${
                  group.language.color
                }"></span>
                ${group.language.name}
              </span>
              <span>${Utils.formatDuration(group.duration)}</span>
            </div>
          `
                )
                .join("")
            : '<div class="empty-state">No coding activity tracked today</div>'
        }
        
        <h2>Recent Sessions</h2>
        ${
          this.completedSessions.length > 0
            ? this.completedSessions
                .map(
                  (session) => `
            <div class="session-item">
              <div class="session-header">
                <span>
                  <span class="language-dot" style="background-color: ${
                    session.language.color
                  }"></span>
                  ${session.language.name}
                </span>
                <span>${Utils.formatDuration(session.duration)}</span>
              </div>
            <div class="session-details">
                ${this.formatDateTime(
                  session.startTime
                )} - ${this.formatDateTime(session.endTime)}
              </div>
            </div>
          `
                )
                .join("")
            : '<div class="empty-state">No recent sessions</div>'
        }
        
        <div style="text-align: center; margin-top: 20px;">
          <button class="refresh-btn" onclick="refresh()">Refresh Data</button>
          <br>
          <button class="settings-btn" onclick="openSettings()">Settings</button>
        </div>
        
        <script>
          function refresh() {
            vscode.postMessage({
              command: 'refresh'
            });
          }
          
          function openSettings() {
            vscode.postMessage({
              command: 'openSettings'
            });
          }
          
          // Acquire VS Code API
          const vscode = acquireVsCodeApi();
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Calculate the total duration of a list of sessions
   * @param {Array} sessions - List of sessions
   * @returns {number} - Total duration in seconds
   */
  calculateTotalDuration(sessions) {
    return sessions.reduce((total, session) => total + session.duration, 0);
  }

  /**
   * Group sessions by language and calculate total duration per language
   * @param {Array} sessions - List of sessions
   * @returns {Array} - List of language groups with durations
   */
  groupSessionsByLanguage(sessions) {
    const groups = new Map();

    for (const session of sessions) {
      const key = session.language.id;
      if (!groups.has(key)) {
        groups.set(key, {
          language: session.language,
          duration: 0,
        });
      }

      const group = groups.get(key);
      group.duration += session.duration;
    }

    // Convert to array and sort by duration (descending)
    return Array.from(groups.values()).sort((a, b) => b.duration - a.duration);
  }

  /**
   * Format a date/time for display
   * @param {Date|string} datetime - Date object or ISO string
   * @returns {string} - Formatted time
   */
  formatDateTime(datetime) {
    const date = datetime instanceof Date ? datetime : new Date(datetime);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /**
   * Get the duration of the active session
   * @param {Object} session - The active session
   * @returns {string} - Formatted duration
   */
  getSessionDuration(session) {
    if (!session.startTime) return "0s";

    const now = new Date();
    const duration = Math.floor((now - new Date(session.startTime)) / 1000);
    return Utils.formatDuration(duration);
  }
}

module.exports = SummaryViewProvider;

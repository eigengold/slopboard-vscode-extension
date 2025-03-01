const vscode = require("vscode");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const { minimatch } = require("minimatch");

// Import services
const apiService = require("./apiService");
const storageService = require("./storageService");
const languageService = require("./languageService");
const Utils = require("./utils");
const SummaryViewProvider = require("./viewProvider");

// Extension state
let activeSession = null;
let lastActivityTime = null;
let activityCheckInterval = null;
let uploadInterval = null;
let statusBarItem = null;
let isTracking = false;
let summaryViewProvider = null;
let pendingUpload = false;
let uploadRetryCount = 0;

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  console.log("Slopboard Tracker is now active");

  // Initialize services
  storageService.setContext(context);
  await languageService.initialize();

  // Create summary view provider
  summaryViewProvider = new SummaryViewProvider(context.extensionUri);

  // Register view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "slopboardTrackerSummary",
      summaryViewProvider
    )
  );

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "slopboardTracker.toggleTracking";
  updateStatusBar();
  statusBarItem.show();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("slopboardTracker.start", startTracking),
    vscode.commands.registerCommand("slopboardTracker.stop", stopTracking),
    vscode.commands.registerCommand("slopboardTracker.setApiKey", setApiKey),
    vscode.commands.registerCommand(
      "slopboardTracker.toggleTracking",
      toggleTracking
    ),
    vscode.commands.registerCommand(
      "slopboardTracker.setIdleThreshold",
      setIdleThreshold
    ),
    vscode.commands.registerCommand(
      "slopboardTracker.toggleAutoTracking",
      toggleAutoTracking
    ),
    vscode.commands.registerCommand(
      "slopboardTracker.setUploadInterval",
      setUploadInterval
    ),
    vscode.commands.registerCommand(
      "slopboardTracker.setMinSessionDuration",
      setMinSessionDuration
    ),
    vscode.commands.registerCommand(
      "slopboardTracker.viewSettings",
      viewSettings
    )
  );

  // Set up event listeners
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(onDocumentChange),
    vscode.window.onDidChangeActiveTextEditor(onEditorChange),
    vscode.window.onDidChangeWindowState(onWindowStateChange)
  );

  // Start tracking if enabled
  const config = vscode.workspace.getConfiguration("slopboardTracker");
  if (config.get("enabled")) {
    startTracking();
  }

  // Try to send offline sessions
  sendOfflineSessions();

  // Save extension context for later use
  module.exports.extensionContext = context;
}

/**
 * Deactivate the extension
 */
function deactivate() {
  stopTracking();
}

/**
 * Update status bar display
 */
function updateStatusBar() {
  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const autoTrackEnabled = config.get("autoTrackEnabled", true);

  if (isTracking) {
    if (autoTrackEnabled) {
      statusBarItem.text = "$(clock) Auto-Tracking";
      statusBarItem.tooltip =
        "Slopboard Tracker is automatically tracking your coding time";
    } else {
      statusBarItem.text = "$(clock) Tracking";
      statusBarItem.tooltip = "Slopboard Tracker is active";
    }
  } else {
    statusBarItem.text = "$(clock) Not Tracking";
    statusBarItem.tooltip = "Slopboard Tracker is paused";
  }
}

/**
 * Toggle time tracking on/off
 */
function toggleTracking() {
  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const newState = !config.get("enabled");

  config.update("enabled", newState, true).then(() => {
    if (newState) {
      startTracking();
    } else {
      stopTracking();
    }
  });
}

/**
 * Start time tracking
 */
function startTracking() {
  if (isTracking) return;

  const config = vscode.workspace.getConfiguration("slopboardTracker");
  if (!config.get("apiKey")) {
    vscode.window
      .showWarningMessage(
        "Please set your API key to enable time tracking.",
        "Set API Key"
      )
      .then((selection) => {
        if (selection === "Set API Key") {
          setApiKey();
        }
      });
    return;
  }

  isTracking = true;
  lastActivityTime = new Date();

  // Start checking for idle time
  const idleThreshold = config.get("idleThreshold");
  activityCheckInterval = setInterval(
    () => checkActivity(idleThreshold),
    10000
  );

  // Set up interval for uploading sessions
  const uploadIntervalSecs = config.get("uploadInterval");
  setupUploadInterval(uploadIntervalSecs);

  // Start a session if an editor is already active and auto-tracking is enabled
  if (
    vscode.window.activeTextEditor &&
    shouldTrackDocument(vscode.window.activeTextEditor.document)
  ) {
    startSession(vscode.window.activeTextEditor.document);
  }

  updateStatusBar();
  vscode.window.showInformationMessage("Slopboard Tracker has started");
}

/**
 * Stop time tracking
 */
function stopTracking() {
  if (!isTracking) return;

  isTracking = false;

  if (activityCheckInterval) {
    clearInterval(activityCheckInterval);
    activityCheckInterval = null;
  }

  if (uploadInterval) {
    clearInterval(uploadInterval);
    uploadInterval = null;
  }

  // End the current session if one exists
  if (activeSession) {
    endSession();
  }

  updateStatusBar();
  vscode.window.showInformationMessage("Slopboard Tracker has stopped");
}

/**
 * Set the API key for the service
 */
async function setApiKey() {
  const apiKey = await vscode.window.showInputBox({
    prompt: "Enter your Slopboard Tracker API key",
    password: true,
    ignoreFocusOut: true,
  });

  if (apiKey) {
    // Validate the API key
    try {
      const isValid = await apiService.validateApiKey(apiKey);
      if (isValid) {
        const config = vscode.workspace.getConfiguration("slopboardTracker");
        await config.update("apiKey", apiKey, true);
        vscode.window.showInformationMessage("API key has been saved");

        // Try to send any offline sessions with the new key
        sendOfflineSessions();
      } else {
        vscode.window.showErrorMessage("Invalid API key. Please try again.");
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        "Could not validate API key. Please check your internet connection."
      );
    }
  }
}

/**
 * Handler for document changes
 * @param {vscode.TextDocumentChangeEvent} event
 */
function onDocumentChange(event) {
  if (!isTracking) return;

  lastActivityTime = new Date();

  // If we don't have an active session, create one
  if (!activeSession && shouldTrackDocument(event.document)) {
    startSession(event.document);
  }
}

/**
 * Handler for active editor changes
 * @param {vscode.TextEditor} editor
 */
function onEditorChange(editor) {
  if (!isTracking || !editor) return;

  lastActivityTime = new Date();

  // End current session if we have one
  if (activeSession) {
    endSession();
  }

  // Start new session if we should track this document
  if (shouldTrackDocument(editor.document)) {
    startSession(editor.document);
  }
}

/**
 * Handler for window state changes (focus/blur)
 * @param {vscode.WindowState} state
 */
function onWindowStateChange(state) {
  if (!isTracking) return;

  if (state.focused) {
    // Window gained focus
    lastActivityTime = new Date();

    // Start a new session if appropriate
    if (
      !activeSession &&
      vscode.window.activeTextEditor &&
      shouldTrackDocument(vscode.window.activeTextEditor.document)
    ) {
      startSession(vscode.window.activeTextEditor.document);
    }
  } else {
    // Window lost focus
    if (activeSession) {
      endSession();
    }
  }
}

/**
 * Check if a document should be tracked based on privacy settings and auto tracking status
 * @param {vscode.TextDocument} document
 * @returns {boolean}
 */
function shouldTrackDocument(document) {
  if (!document || document.isUntitled || document.uri.scheme !== "file") {
    return false;
  }

  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const autoTrackEnabled = config.get("autoTrackEnabled", true);

  // If tracking is disabled entirely, don't track
  if (!config.get("enabled")) {
    return false;
  }

  // If auto-tracking is disabled, only track if manually enabled
  if (!autoTrackEnabled && !isTracking) {
    return false;
  }
  
  const excludedProjects = config.get("excludedProjects", []);
  const excludedFiles = config.get("excludedFiles", []);

  const filePath = document.uri.fsPath;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const projectName = workspaceFolder
    ? path.basename(workspaceFolder.uri.fsPath)
    : "unknown";

  // Check if project is excluded
  if (excludedProjects.includes(projectName)) {
    return false;
  }

  // Check if file matches any excluded patterns
  for (const pattern of excludedFiles) {
    if (minimatch(filePath, pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * Start a new coding session
 * @param {vscode.TextDocument} document
 */
function startSession(document) {
  if (activeSession) {
    endSession();
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const projectName = workspaceFolder
    ? path.basename(workspaceFolder.uri.fsPath)
    : "unknown";
  const filePath = document.uri.fsPath;
  const relativePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, filePath)
    : filePath;

  const language = languageService.detectLanguage(
    filePath,
    document.languageId
  );

  activeSession = {
    id: uuidv4(),
    language,
    projectName,
    filePath: relativePath,
    startTime: new Date(),
    endTime: null,
    duration: 0,
  };

  // Update the summary view with the active session
  if (summaryViewProvider) {
    summaryViewProvider.setActiveSession(activeSession);
  }
}

/**
 * End the current session and save it
 */
function endSession() {
  if (!activeSession) return;

  const now = new Date();
  activeSession.endTime = now;
  activeSession.duration = Math.floor((now - activeSession.startTime) / 1000);

  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const minDuration = config.get("minSessionDuration", 5);

  // Only save sessions that have a meaningful duration
  if (activeSession.duration >= minDuration) {
    saveSession(activeSession);

    // Update the summary view with the completed session
    if (summaryViewProvider) {
      summaryViewProvider.addCompletedSession(activeSession);
    }
  }

  activeSession = null;

  // Update the summary view to clear active session
  if (summaryViewProvider) {
    summaryViewProvider.setActiveSession(null);
  }
}

/**
 * Save a session by sending it to the API or storing it locally
 * @param {Object} session
 */
async function saveSession(session) {
  try {
    await sendSession(session);
  } catch (error) {
    console.error("Failed to send session:", error);

    // Store session for later transmission
    await storageService.addOfflineSession(session);

    // Show notification for first offline session
    if (storageService.getOfflineSessionCount() === 1) {
      vscode.window.showInformationMessage(
        "Session saved offline. It will be sent when connection is restored."
      );
    }
  }
}

/**
 * Send a session to the API
 * @param {Object} session
 * @returns {Promise}
 */
async function sendSession(session) {
  // Format the session data according to our database schema
  const sessionData = {
    language_id: session.language.id,
    start_time: session.startTime.toISOString(),
    end_time: session.endTime.toISOString(),
    duration: session.duration
  };

  // Send the data to the API
  return apiService.sendSession(sessionData);
}

/**
 * Send offline sessions in efficient batches
 */
async function sendOfflineSessions() {
  if (!storageService.hasOfflineSessions() || pendingUpload) return;

  pendingUpload = true;

  try {
    const config = vscode.workspace.getConfiguration("slopboardTracker");
    const apiKey = config.get("apiKey");

    if (!apiKey) {
      pendingUpload = false;
      return;
    }

    // Get appropriate batch size based on session count
    const totalSessions = storageService.getOfflineSessionCount();
    let batchSize = config.get("uploadBatchSize", 10);

    // Increase batch size if there are many sessions, to process them faster
    if (totalSessions > 100) batchSize = 50;
    if (totalSessions > 500) batchSize = 100;

    const sessionsToSend = storageService.getOfflineSessions(batchSize);

    if (sessionsToSend.length === 0) {
      pendingUpload = false;
      return;
    }

    // Convert sessions to the format expected by the API
    const formattedSessions = sessionsToSend.map((session) => ({
      language_id: session.language.id,
      start_time: session.startTime,
      end_time: session.endTime,
      duration: session.duration
    }));

    // Send the batch
    await apiService.sendBatchSessions(formattedSessions);

    // Remove successfully sent sessions
    await storageService.removeOfflineSessions(sessionsToSend.length);

    // Show upload progress for large backlogs
    if (totalSessions > 100) {
      const remaining = storageService.getOfflineSessionCount();
      vscode.window.setStatusBarMessage(
        `Syncing coding sessions: ${remaining} remaining`,
        3000
      );
    }

    if (storageService.hasOfflineSessions()) {
      // Schedule next batch with adaptive delay based on remaining count
      const delay = Math.min(
        Math.max(500, totalSessions > 1000 ? 500 : 2000),
        5000
      );
      setTimeout(sendOfflineSessions, delay);
    } else if (totalSessions >= batchSize) {
      // Only show notification for significant syncs
      vscode.window.showInformationMessage(
        `${totalSessions} coding sessions have been synced.`
      );
    }

    // Reset retry count on success
    uploadRetryCount = 0;
  } catch (error) {
    console.error("Failed to send offline sessions:", error);
    // We'll try again during the next scheduled upload
    // Add exponential backoff for repeated failures
    if (uploadRetryCount < 5) {
      uploadRetryCount++;
      setTimeout(sendOfflineSessions, 1000 * Math.pow(2, uploadRetryCount));
    } else {
      uploadRetryCount = 0; // Reset for next time
    }
  } finally {
    pendingUpload = false;
  }
}

/**
 * Setup the upload interval for sessions
 * @param {number} intervalSeconds - Interval in seconds
 */
function setupUploadInterval(intervalSeconds) {
  // Clear existing interval if any
  if (uploadInterval) {
    clearInterval(uploadInterval);
    uploadInterval = null;
  }

  // Convert seconds to milliseconds
  const intervalMs = intervalSeconds * 1000;

  // Set up new interval
  uploadInterval = setInterval(sendOfflineSessions, intervalMs);
}

/**
 * Check for idle time and end the session if idle too long
 * @param {number} idleThresholdSeconds
 */
function checkActivity(idleThresholdSeconds) {
  if (!activeSession || !lastActivityTime) return;

  const now = new Date();
  const idleTime = (now - lastActivityTime) / 1000;

  if (idleTime > idleThresholdSeconds) {
    // End the current session due to inactivity
    endSession();
  }
}

/**
 * Update user configuration setting
 * @param {string} setting - The setting name (without the slopboardTracker prefix)
 * @param {any} value - The new value
 */
async function updateUserSetting(setting, value) {
  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const fullSetting = `slopboardTracker.${setting}`;

  try {
    await config.update(setting, value, true);
    return true;
  } catch (error) {
    console.error(`Failed to update setting ${fullSetting}:`, error);
    vscode.window.showErrorMessage(`Failed to update ${setting} setting.`);
    return false;
  }
}

/**
 * Allow user to set the idle threshold
 */
async function setIdleThreshold() {
  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const currentThreshold = config.get("idleThreshold");

  const input = await vscode.window.showInputBox({
    prompt: "Enter idle threshold in seconds",
    value: currentThreshold.toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      return Number.isInteger(num) && num > 0
        ? null
        : "Please enter a positive integer";
    },
  });

  if (input) {
    const newThreshold = parseInt(input);
    await updateUserSetting("idleThreshold", newThreshold);

    // Update the active interval if tracking is enabled
    if (isTracking && activityCheckInterval) {
      clearInterval(activityCheckInterval);
      activityCheckInterval = setInterval(
        () => checkActivity(newThreshold),
        10000
      );
    }

    vscode.window.showInformationMessage(
      `Idle threshold updated to ${newThreshold} seconds`
    );
  }
}

/**
 * Toggle automatic tracking on/off
 */
async function toggleAutoTracking() {
  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const currentAutoTrack = config.get("autoTrackEnabled");

  await updateUserSetting("autoTrackEnabled", !currentAutoTrack);

  if (!currentAutoTrack) {
    vscode.window.showInformationMessage("Automatic tracking enabled");

    // If we're already tracking and have an active editor, start a session
    if (
      isTracking &&
      vscode.window.activeTextEditor &&
      shouldTrackDocument(vscode.window.activeTextEditor.document)
    ) {
      startSession(vscode.window.activeTextEditor.document);
    }
  } else {
    vscode.window.showInformationMessage("Automatic tracking disabled");

    // End the current session if one exists
    if (activeSession) {
      endSession();
    }
  }
}

/**
 * Set the upload interval for sessions
 */
async function setUploadInterval() {
  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const currentInterval = config.get("uploadInterval");

  const input = await vscode.window.showInputBox({
    prompt: "Enter upload interval in seconds",
    value: currentInterval.toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      return Number.isInteger(num) && num >= 60
        ? null
        : "Please enter a positive integer (minimum 60 seconds)";
    },
  });

  if (input) {
    const newInterval = parseInt(input);
    await updateUserSetting("uploadInterval", newInterval);

    // Update the active interval if tracking is enabled
    if (isTracking) {
      setupUploadInterval(newInterval);
    }

    vscode.window.showInformationMessage(
      `Upload interval updated to ${newInterval} seconds`
    );
  }
}

/**
 * Set the minimum duration for a session to be saved
 */
async function setMinSessionDuration() {
  const config = vscode.workspace.getConfiguration("slopboardTracker");
  const currentMin = config.get("minSessionDuration");

  const input = await vscode.window.showInputBox({
    prompt: "Enter minimum session duration in seconds",
    value: currentMin.toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      return Number.isInteger(num) && num >= 0
        ? null
        : "Please enter a positive integer";
    },
  });

  if (input) {
    const newMin = parseInt(input);
    await updateUserSetting("minSessionDuration", newMin);
    vscode.window.showInformationMessage(
      `Minimum session duration updated to ${newMin} seconds`
    );
  }
}

/**
 * Display current settings in a quick pick menu
 */
async function viewSettings() {
  const config = vscode.workspace.getConfiguration("slopboardTracker");

  const settings = [
    {
      label: `Tracking: ${config.get("enabled") ? "Enabled" : "Disabled"}`,
      description: "Toggle tracking on/off",
      command: "slopboardTracker.toggleTracking",
    },
    {
      label: `Auto-tracking: ${
        config.get("autoTrackEnabled") ? "Enabled" : "Disabled"
      }`,
      description: "Toggle automatic tracking on/off",
      command: "slopboardTracker.toggleAutoTracking",
    },
    {
      label: `Idle Threshold: ${config.get("idleThreshold")} seconds`,
      description: "Set idle time before tracking stops",
      command: "slopboardTracker.setIdleThreshold",
    },
    {
      label: `Upload Interval: ${config.get("uploadInterval")} seconds`,
      description: "Set interval between data uploads",
      command: "slopboardTracker.setUploadInterval",
    },
    {
      label: `Min Session Duration: ${config.get(
        "minSessionDuration"
      )} seconds`,
      description: "Set minimum duration for a session to be saved",
      command: "slopboardTracker.setMinSessionDuration",
    },
    {
      label: "Set API Key",
      description: "Configure your API key",
      command: "slopboardTracker.setApiKey",
    },
  ];

  const selected = await vscode.window.showQuickPick(settings, {
    placeHolder: "View or modify Slopboard Tracker settings",
  });

  if (selected) {
    vscode.commands.executeCommand(selected.command);
  }
}

// Export functions for testing and extension management
module.exports = {
  activate,
  deactivate,
  extensionContext: null,
  updateUserSetting,
};
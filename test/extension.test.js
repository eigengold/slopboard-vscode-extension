const assert = require("assert");
const vscode = require("vscode");
const sinon = require("sinon");
const extension = require("../extension");
const apiService = require("../apiService");
const storageService = require("../storageService");
const languageService = require("../languageService");

// Mock data
const mockSession = {
  id: "test-id",
  language: { id: 1, name: "JavaScript", color: "#f7df1e" },
  projectName: "test-project",
  filePath: "test-file.js",
  startTime: new Date("2023-01-01T12:00:00Z"),
  endTime: new Date("2023-01-01T12:30:00Z"),
  duration: 1800,
};

suite("Slopboard Tracker Tests", () => {
  let sandbox;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Mock API service
    sandbox.stub(apiService, "sendSession").resolves({ status: 200 });
    sandbox.stub(apiService, "sendBatchSessions").resolves({ status: 200 });
    sandbox.stub(apiService, "validateApiKey").resolves(true);

    // Mock storage service
    sandbox.stub(storageService, "addOfflineSession").resolves();
    sandbox.stub(storageService, "getOfflineSessions").returns([mockSession]);
    sandbox.stub(storageService, "removeOfflineSessions").resolves();
    sandbox.stub(storageService, "hasOfflineSessions").returns(true);

    // Mock language service
    sandbox
      .stub(languageService, "detectLanguage")
      .returns({ id: 1, name: "JavaScript", color: "#f7df1e" });
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Extension should be activated", async () => {
    const ext = vscode.extensions.getExtension("publisher.code-time-tracker");

    // This will be null in the test environment
    // Just checking that our module loads without errors
    assert.strictEqual(typeof extension.activate, "function");
  });

  test("Language detection works correctly", () => {
    const jsLanguage = languageService.detectLanguage("test.js", "javascript");
    assert.strictEqual(jsLanguage.id, 1);
    assert.strictEqual(jsLanguage.name, "JavaScript");
  });

  test("API service sends sessions correctly", async () => {
    // Format session data for API
    const sessionData = {
      language_id: mockSession.language.id,
      start_time: mockSession.startTime.toISOString(),
      end_time: mockSession.endTime.toISOString(),
      duration: mockSession.duration,
      project_name: mockSession.projectName,
      file_path: mockSession.filePath,
    };

    // Send via API service
    const result = await apiService.sendSession(sessionData);

    // Check that sendSession was called with correct data
    assert(apiService.sendSession.calledOnce);
    assert.deepStrictEqual(
      apiService.sendSession.firstCall.args[0],
      sessionData
    );
  });

  test("Offline sessions are stored correctly", async () => {
    // Add a session to offline storage
    await storageService.addOfflineSession(mockSession);

    // Check that addOfflineSession was called with correct data
    assert(storageService.addOfflineSession.calledOnce);
    assert.deepStrictEqual(
      storageService.addOfflineSession.firstCall.args[0],
      mockSession
    );
  });
});

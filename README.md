# Slopboard Tracker

A VS Code extension that tracks your coding time across different languages and projects.

## Features

- **Automatic Time Tracking**: Tracks your active coding time without getting in your way
- **Language Detection**: Automatically detects the programming language you're working with
- **Project Organization**: Groups tracking data by project
- **Idle Detection**: Stops tracking when you're not actively coding
- **Privacy Controls**: Exclude specific projects or files from tracking
- **Offline Support**: Works even when you're offline, syncing data when reconnected

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Slopboard Tracker"
4. Click Install

## Setup

1. Get an API key from your Slopboard Tracker account
2. Open VS Code
3. Open Command Palette (Ctrl+Shift+P)
4. Type "Slopboard Tracker: Set API Key" and press Enter
5. Enter your API key when prompted

## Configuration

This extension can be customized through VS Code settings:

- **slopboardTracker.apiKey**: Your API key for the service
- **slopboardTracker.idleThreshold**: Time in seconds before considered idle (default: 120)
- **slopboardTracker.excludedProjects**: List of project names to exclude from tracking
- **slopboardTracker.excludedFiles**: List of file patterns to exclude from tracking
- **slopboardTracker.enabled**: Enable or disable time tracking

Example configuration in `settings.json`:

```json
{
  "slopboardTracker.idleThreshold": 300,
  "slopboardTracker.excludedProjects": ["personal-notes", "private-project"],
  "slopboardTracker.excludedFiles": ["**/*.log", "**/node_modules/**"],
  "slopboardTracker.enabled": true
}
```

## Commands

- **Slopboard Tracker: Start Time Tracking**: Start tracking your coding time
- **Slopboard Tracker: Stop Time Tracking**: Stop tracking your coding time
- **Slopboard Tracker: Set API Key**: Set or update your API key

## Privacy

This extension only tracks:
- Which programming languages you use
- How long you spend coding in each file
- Project names and relative file paths

It does NOT track or send:
- The actual code you write
- Personal information
- Absolute file paths

You can further control what's tracked using the exclusion settings.

## Troubleshooting

### Extension not tracking time
- Check if the extension is enabled in VS Code settings
- Verify your API key is correctly set
- Check VS Code's Developer Console for any error messages

### Sessions not syncing
- Verify your internet connection
- Check if your API key is valid
- The extension will retry automatically when connection is restored

## License

This project is licensed under the MIT License - see the LICENSE file for details.
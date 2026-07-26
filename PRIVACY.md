# Privacy

Yuuka VS Code Pet is designed to run locally inside VS Code.

## Data the extension does not access

- Source code or document text
- File names or workspace paths
- Terminal output
- Git commit content or repository history
- Network services, analytics, or telemetry

## Local state

Mood and affinity values are stored only in VS Code's local Webview state. They can
be disabled in Settings or cleared with `Yuuka Pet: Reset Mood and Affinity`.

Editor reactions use event timing and reliable VS Code Task exit codes only. The
extension does not inspect saved documents or task output.

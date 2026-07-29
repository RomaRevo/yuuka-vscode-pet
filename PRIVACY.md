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
be viewed and changed from the local Relationship panel, disabled in Settings, or
cleared with `Yuuka Pet: Reset Mood and Affinity`. These values are never uploaded.

The selected background scene is stored as a local VS Code setting. Office,
Millennium, and transparent-style backgrounds use bundled local assets and make no
runtime network requests.

Tasks, reminder text, the selected task, and the active timer are stored in VS Code
workspace state so different workspaces remain separate. Aggregate focus statistics
are stored in global state as dates and numeric counts only; task and reminder text is
never copied into statistics. Statistics can be cleared from the extension UI or the
`Yuuka Pet: Clear Focus Statistics` command.

Completed daily tasks are removed from workspace state when the local calendar day
changes. Unfinished tasks remain in the current workspace and roll forward without
being copied to global statistics.

Editor reactions use event timing and reliable VS Code Task exit codes only. The
extension does not inspect saved documents or task output.

---
description: Show checkpointing status for this project (configured, enabled, pending/archived)
allowed-tools: Bash(node:*)
---

Checkpointing status for this project:

!`node "$CLAUDE_PLUGIN_ROOT/dist/index.js" status "$(pwd)"`

Relay the output above to the user verbatim.

---
description: Write a manual raw session checkpoint (if checkpointing is enabled here)
allowed-tools: Bash(node:*)
---

Capturing a checkpoint of the current session:

!`node "$CLAUDE_PLUGIN_ROOT/dist/index.js" manual "$(pwd)"`

Relay the output above to the user verbatim.

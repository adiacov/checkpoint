---
name: checkpoint
description: Write a manual raw session checkpoint (if checkpointing is enabled here)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Capturing a checkpoint of the current session:

!`node "${CLAUDE_SKILL_DIR}/../../dist/index.js" manual "$(pwd)"`

Relay the output above to the user verbatim.

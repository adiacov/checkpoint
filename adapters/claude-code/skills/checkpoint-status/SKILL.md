---
name: checkpoint-status
description: Show checkpointing status for this project (configured, enabled, pending/archived)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Checkpointing status for this project:

!`node "${CLAUDE_SKILL_DIR}/../../dist/index.js" status "$(pwd)"`

Relay the output above to the user verbatim.

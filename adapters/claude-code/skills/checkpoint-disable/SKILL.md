---
name: checkpoint-disable
description: Disable checkpointing for this project (configuration is kept)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Disabling checkpointing for this project:

!`node "${CLAUDE_SKILL_DIR}/../../dist/index.js" disable "$(pwd)"`

Relay the output above to the user verbatim.

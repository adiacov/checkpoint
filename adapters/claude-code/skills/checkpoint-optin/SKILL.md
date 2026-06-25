---
name: checkpoint-optin
description: Opt this project into checkpointing (create config, dirs, and ignore rules)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Opting this project into checkpointing:

!`node "${CLAUDE_SKILL_DIR}/../../dist/index.js" optin "$(pwd)"`

Relay the output above to the user verbatim.

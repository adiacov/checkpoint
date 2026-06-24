---
description: Enable checkpointing for this project (config, dirs, ignore rules) via the adapter.
---

Run this exact shell command and report its output verbatim, then stop:

```
node "<BRIDGE>/dist/index.js" optin "$PWD"
```

`<BRIDGE>` is the installed checkpoint Codex adapter path (resolved at install; feature 006). The
adapter and the shared core do all the work — just run the command and show the result.

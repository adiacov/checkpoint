---
description: Write a manual checkpoint of the current session via the checkpoint adapter.
---

Run this exact shell command and report its output verbatim, then stop:

```
node "<BRIDGE>/dist/index.js" manual "$PWD"
```

`<BRIDGE>` is the installed checkpoint Codex adapter path (resolved at install; feature 006). Do not
write or summarize a checkpoint yourself — the adapter and the shared core do all the work. Just run
the command and show the result.

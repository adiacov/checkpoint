---
description: Show checkpoint status and pending count for this project via the adapter.
---

Run this exact shell command and report its output verbatim, then stop:

```
node "<BRIDGE>/dist/index.js" status "$PWD"
```

`<BRIDGE>` is the installed checkpoint Codex adapter path (resolved at install; feature 006). The
adapter and the shared core do all the work — just run the command and show the result. (This is
also how you check the pending checkpoint count, since Codex has no start-of-session notice.)

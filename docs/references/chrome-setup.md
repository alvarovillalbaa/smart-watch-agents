# Chrome new-tab client

Last updated: 2026-11-14

The [packaged browser checks passed](../results/2026/11-14/chrome-narrow/result.md)
across two focused invocations, retaining the initial capability failures.
Read their actual scope; these instructions are not extra runtime proof. The
macOS companion/widget has separate native receipts linked from the README.
No Chrome Web Store account is required
for the developer ZIP; no store publication/signing is claimed.

Build a NEW directory with Node24+ and Python3 standard library, without an
extension runtime dependency install:

```sh
npm run package:chrome
```

Respect local Storage Guard before building. Existing output is refused, never
deleted. The script copies the exact source, generates the original four-size
status icon, and writes a ZIP/manifest beside the new unpacked folder. The
source manifest references generated icons, so load the built unpacked folder,
not the unfinished source directory. In chrome://extensions enable Developer
mode, choose Load unpacked and select dist/watch-agents-chrome-0.2.0. Open a
new tab. The [public webpage preview](https://watch-agents-alvaro.vercel.app)
uses separate authored data and cannot pair/control a real hub.

Apply explicit migrations through3 to your own selected hub and configure its
TLS origin (HTTP is permitted only for localhost/127.0.0.1 development).
Create a one-time code on that hub with npm run hubctl -- pair create. Pair
through Device setup. This authorizes the single-owner device; there is no
role/tenant or read-only-token scope. Never enter bootstrap/connector secrets
in the extension. Its token/nonextractable WebCrypto private key remain in its
own IndexedDB; no Chrome sync, page injection, history read or background worker.
The manifest requests HTTPS and explicit localhost network host access because
you choose your own hub address. No other provider/account/model is configured.

Opening/Refresh reads the latest100 runs and the hub's rolling seven-day start
counts. Zero/empty/stale/error states are explicit; a failed refresh keeps its
last successful view. Review actual HITL description/risk/expiry or the stored
follow-up text, then choose Send reviewed request. A hub command acknowledgement
does not mean the runtime executed it; its connector reports later run updates.

Before sending, the exact signed intent is saved. A lost response remains under
Saved requests. Retry saved request sends the same intent to its original hub,
even after another pairing; it cannot queue a duplicate of a committed intent.
Nothing automatically retries an agent action. Changing views cannot undo an
already accepted command. Clear acknowledged local receipts retains pending
requests and the server's records. Local receipt storage is bounded100 entries.

Forget this device's local data explicitly deletes local keys/pairing/intents;
it cannot revoke the hub device record or undo commands. The confirmation says
so. Corrupt metadata and quota failures are visible and never auto-reset the
device. A pairing may be accepted remotely even if local storage refuses it;
check that original hub before creating another code. Existing local pairing
is kept if a newer tab wins or the new write fails.

Public keys/signatures may appear in authored test evidence; private keys and
bearer tokens must never be exported in artifacts. Protocol/native/source/
browser/hosted/device boundaries retain their own results. See the concrete
[Chrome scope](../proposals/chrome-checks-v1.md).

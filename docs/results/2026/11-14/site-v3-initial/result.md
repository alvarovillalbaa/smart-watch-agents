# Desktop public preview accepted; narrow capability observation retained

[Run43606460974](https://github.com/alvarovillalbaa/smart-watch-agents/actions/runs/43606460974)
at39c625ea77b3a97e75bb0abe1b0ff6f7643c70b6 used immutable production
dpl_HP37o6MFSce1px7c791igJEhrMpM at a56fda23. S01 DESKTOP PASSED: actual
landing→preview, explicit authored state and initially empty runs, sample-load,
both actions disabled, actual search/filter, keyboard focus, matching width,
reload clears samples, zero console/page errors and no hub request.

Both narrow cases reached matching390/390 and320/320 widths, actual filters,
solid keyboard focus and a trusted touch pointer event on Load authored preview.
They then failed navigator.maxTouchPoints>0 (actual0). Later reload acceptance
was not reached. Preserve both as incomplete. The separate installed-extension
qualification had already observed a similar post-navigation capability issue;
use explicit CDP Emulation.setTouchEmulationEnabled after the new document
loads, retain the same property/event/fit/reload assertions, and rerun ONLY
S02-390/S03-320. Do not replay accepted S01 or change public product source.
This remains emulated Chromium touch, not a physical touchscreen claim.

All ten source fingerprints (nine raw/one canonical JSON), eight public asset
bodies, manifest and exact favicon route passed. Ten actual anonymous bodies
are retained with hashes/headers. All three contexts/browser closed; parent
commands/source/scratch dispositions are in the original receipt. Original
1213214B ZIP SHA256
9f74a81cacc9524abc71de6cb0329402609cb8429ebc52a0aecfec001f9f5a95
matches provider digest. S01 screenshots and original narrow failures remain.

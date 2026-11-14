# Initial public-site observation — stopped before UI

[Run43605325967](https://github.com/alvarovillalbaa/smart-watch-agents/actions/runs/43605325967)
at17c5477dbc4e9ffd9191cdd403d6311471932173 failed the source-input bridge.
Actual anonymous immutable production deploymentdpl_DFRn6i9rtkDGb7e2jgvX3NKN3Ehc
returned its3202B manifest200, SHA256
2015b66f10196304cef34e08f3d222f3592cd8e1e51cdcdfd512cf989a8cf346.
No browser context or UI case was reached; this is not three failed UI cases.

The Vercel builder serialized vercel.json to compact JSON plus newline. Original
Git source722B vs observed637B. Recomputing JSON.stringify(JSON.parse(source))
plus newline produced exactly637B/hash
a1362dfe068351d61596bbecce3b2a5d74a6d1720c2c9e02c24589cfbeb59db3,
matching the observed manifest. It is a formatting normalization, not an assumed
configuration equivalence. Version2 will explicitly fingerprint canonical JSON
for this one config path, retain raw bytes for all other inputs/assets and
still require exact hashes. Unknown encodings fail. Preserve this original.

Original41515B ZIP SHA256
877bd3c269dc3a803be3a4b366a3d0b25d992db44d10ffe6fdcdc68ecaa69a47
matches the provider. Four commands terminated/reaped/groups absent; owned
1025018920B tools/browser/source scratch removed. The missing browser was not
reported as closed or accepted. No hub/provider/model/account request occurred.
The independent source-link review also corrected the landing's security link
to the existing docs/SECURITY.md before retrying on a new immutable deployment.

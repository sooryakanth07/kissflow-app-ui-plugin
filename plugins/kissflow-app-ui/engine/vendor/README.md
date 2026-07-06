# Vendored — `page_builder`

`page_builder/` is Kissflow's own page-metadata transformer, vendored verbatim from
`kissflow-xg` (`metadata/utils/page_builder/`) so the plugin renders native Kissflow pages
WITHOUT requiring a `kissflow-xg` source checkout. It is self-contained (Python stdlib only).

`engine/page_transform.py` loads it from here by default; set `KF_METADATA_PATH` to a live
`kissflow-xg/metadata` dir to override with a fresher copy. Re-vendor with:
`rsync -a --exclude=__pycache__ <kissflow-xg>/metadata/utils/page_builder/ engine/vendor/page_builder/`

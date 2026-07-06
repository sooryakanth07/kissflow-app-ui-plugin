#!/usr/bin/env python3
"""Bridge: run Kissflow's REAL page transformer on an intermediate page spec.

The engine (Node) shells out to this so pages always go through the platform's own
`transformer.py` (never a mirror). `page_builder` is VENDORED into the plugin
(`engine/vendor/page_builder`, stdlib-only), so NO kissflow-xg checkout is needed. It only
fails to import via the normal package path because the source's `utils/__init__.py` pulls
heavy `base.*`, so we register `utils` / `utils.page_builder` as namespace packages first.
Set KF_METADATA_PATH to a live <kissflow-xg>/metadata dir to override the bundled copy.

stdin:  { "intermediate": {...}, "applicationId": "App_A00", "pageId": "Page_A00" }
stdout: the full, rendering-correct page metadata (transformed + rewritten to pageId)
"""
import sys, os, json, types

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLED = os.path.join(HERE, "vendor")  # contains page_builder/
KF = os.environ.get("KF_METADATA_PATH")
UTILS = os.path.join(KF, "utils") if (KF and os.path.isdir(os.path.join(KF, "utils", "page_builder"))) else BUNDLED
if not os.path.isdir(os.path.join(UTILS, "page_builder")):
    sys.stderr.write(f"page_transform: page_builder not found under {UTILS} (bundled copy missing?)\n")
    sys.exit(2)
for pkg, path in (("utils", UTILS), ("utils.page_builder", os.path.join(UTILS, "page_builder"))):
    m = types.ModuleType(pkg)
    m.__path__ = [path]
    sys.modules[pkg] = m
sys.path.insert(0, os.path.dirname(UTILS))
from utils.page_builder.transformer import transform, rewrite_page_id  # noqa: E402

req = json.load(sys.stdin)
meta = transform(req["intermediate"], context={"applicationId": req.get("applicationId", "DefaultApp_A00")})
if req.get("pageId"):
    rewrite_page_id(meta, req["pageId"], req["applicationId"])
json.dump(meta, sys.stdout)

#!/usr/bin/env python3
"""Re-fetch the upstream supabase/supabase docker/ directory at the tag in infra/supabase/VERSION."""
import json, os, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEST = os.path.join(ROOT, "infra", "supabase")
TAG = sys.argv[1] if len(sys.argv) > 1 else open(os.path.join(DEST, "VERSION")).read().strip()
API = "https://api.github.com/repos/supabase/supabase/contents/docker"
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "lm-infra-fetch"})
    return urllib.request.urlopen(req, timeout=60).read()
def walk(path):
    for it in json.loads(get(f"{API}{path}?ref={TAG}")):
        rel = it["path"][len("docker/"):]
        if rel.startswith("tests"):
            continue
        out = os.path.join(DEST, "README.upstream.md" if rel == "README.md" else rel)
        if it["type"] == "dir":
            os.makedirs(out, exist_ok=True); walk("/" + rel)
        else:
            os.makedirs(os.path.dirname(out), exist_ok=True)
            open(out, "wb").write(get(it["download_url"])); print(rel)
walk("")
open(os.path.join(DEST, "VERSION"), "w").write(TAG + "\n")

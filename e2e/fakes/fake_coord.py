"""A fake coord board for the e2e suite: `claims gpu`, `claim <job> gpu <why>` and `unclaim <job> gpu`, as
C:\\dfst_coord\\coord.py prints and answers them. The claims live in `board.json` beside this script, so a test
can seed another job's claim.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BOARD = Path(__file__).resolve().parent / "board.json"


def load():
    return json.loads(BOARD.read_text(encoding="utf-8")) if BOARD.exists() else []


def save(claims):
    BOARD.write_text(json.dumps(claims, indent=1), encoding="utf-8")


command, args = sys.argv[1], sys.argv[2:]
claims = load()
if command == "claims":
    for c in claims:
        print(f"{c['at']}  " + json.dumps({"job": c["job"], "path": c["path"], "why": c["why"]}))
elif command == "claim":
    job, path, why = args[0], args[1], " ".join(args[2:])
    if any(c["path"] == path and c["job"] != job for c in claims):
        print("refused: held", file=sys.stderr)
        sys.exit(1)
    if not any(c["path"] == path and c["job"] == job for c in claims):
        claims.append({"job": job, "path": path, "why": why, "at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")})
        save(claims)
elif command == "unclaim":
    job, path = args[0], args[1]
    save([c for c in claims if not (c["job"] == job and c["path"] == path)])
else:
    sys.exit(2)

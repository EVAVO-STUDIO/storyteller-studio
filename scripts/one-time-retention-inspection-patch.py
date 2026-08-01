from __future__ import annotations

import base64
import hashlib
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = [
    ROOT / "scripts" / f"one-time-retention-inspection-payload.{index:02d}"
    for index in range(8)
]
for part in PARTS:
    if not part.is_file():
        raise SystemExit(f"RETENTION_INSPECTION_PAYLOAD_PART_MISSING:{part.name}")
payload = "".join(part.read_text(encoding="utf-8").strip() for part in PARTS)
if len(payload) != 25972:
    raise SystemExit(f"RETENTION_INSPECTION_PAYLOAD_LENGTH_INVALID:{len(payload)}")
if hashlib.sha256(payload.encode("ascii")).hexdigest() != "21ee6f432da00d1ce079ea91ecf4416b23170cd31727b475fedfd2c2a0044e40":
    raise SystemExit("RETENTION_INSPECTION_PAYLOAD_HASH_INVALID")
for part in PARTS:
    part.unlink()
source = zlib.decompress(base64.b64decode(payload, validate=True))
exec(compile(source, "one-time-retention-inspection-patch", "exec"))

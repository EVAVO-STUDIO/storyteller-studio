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
part_contents: list[str] = []
for part in PARTS:
    if not part.is_file():
        raise SystemExit(f"RETENTION_INSPECTION_PAYLOAD_PART_MISSING:{part.name}")
    part_contents.append(part.read_text(encoding="utf-8").strip())
payload = "".join(part_contents)
if len(payload) != 25972:
    raise SystemExit(f"RETENTION_INSPECTION_PAYLOAD_LENGTH_INVALID:{len(payload)}")
if hashlib.sha256(payload.encode("ascii")).hexdigest() != "21ee6f432da00d1ce079ea91ecf4416b23170cd31727b475fedfd2c2a0044e40":
    raise SystemExit("RETENTION_INSPECTION_PAYLOAD_HASH_INVALID")
for part in PARTS:
    part.unlink()
source = zlib.decompress(base64.b64decode(payload, validate=True)).decode("utf-8")

ambiguous = '''append_after(
    checker,
    \'\'\'  "prunePublicationOperationsBackups",
\'\'\',
    \'\'\'  "assertPublicationOperationsBackupRetentionPlan",
  "assertPublicationOperationsBackupRetentionResult",
\'\'\',
    "RETENTION_CHECKER_ASSERTIONS",
)
'''
scoped = '''replace_once(
    checker,
    \'\'\'  "planPublicationOperationsBackupRetention",
  "prunePublicationOperationsBackups",
  "verifyPublicationOperationsBackupSnapshot",
\'\'\',
    \'\'\'  "planPublicationOperationsBackupRetention",
  "prunePublicationOperationsBackups",
  "assertPublicationOperationsBackupRetentionPlan",
  "assertPublicationOperationsBackupRetentionResult",
  "verifyPublicationOperationsBackupSnapshot",
\'\'\',
    "RETENTION_CHECKER_ASSERTIONS",
)
'''
if source.count(ambiguous) != 1:
    raise SystemExit(
        f"RETENTION_INSPECTION_PATCH_SCOPE_INVALID:{source.count(ambiguous)}"
    )
source = source.replace(ambiguous, scoped, 1)

evidence_tokens = '''  "failureFingerprint",
  "APPLY_FAILURE_INTENT_MISMATCH",
'''
evidence_tokens_scoped = '''  "failureFingerprint",
  'backupState: "inspection-required-until-completed"',
  'backupState: "inspection-required"',
  "APPLY_FAILURE_INTENT_MISMATCH",
'''
if source.count(evidence_tokens) != 1:
    raise SystemExit(
        f"RETENTION_INSPECTION_EVIDENCE_TOKEN_SCOPE_INVALID:{source.count(evidence_tokens)}"
    )
source = source.replace(evidence_tokens, evidence_tokens_scoped, 1)

main_inspection_tokens = '''  'args.command === "inspect"',
  'stringFlag(args, "plan-receipt", true)',
  'stringFlag(args, "apply-receipt", true)',
  'receipt: "inspection"',
'''
main_inspection_tokens_scoped = '''  'args.command === "inspect"',
  'stringFlag(args, "plan-receipt", true)',
  'stringFlag(args, "apply-receipt", true)',
  'await emit(result, output, force, "inspection", stdout);',
'''
if source.count(main_inspection_tokens) != 1:
    raise SystemExit(
        f"RETENTION_INSPECTION_MAIN_TOKEN_SCOPE_INVALID:{source.count(main_inspection_tokens)}"
    )
source = source.replace(
    main_inspection_tokens,
    main_inspection_tokens_scoped,
    1,
)

move_marker = '''    "RETENTION_CHECKER_MOVE_EVIDENCE_CONSTANTS",
)
'''
move_scoped = '''    "RETENTION_CHECKER_MOVE_EVIDENCE_CONSTANTS",
)
replace_once(
    checker,
    \'\'\'  "afterApplyIntent",
  'backupState: "inspection-required-until-completed"',
  'backupState: "inspection-required"',
  "safeCliErrorMessage",
\'\'\',
    \'\'\'  "afterApplyIntent",
  "safeCliErrorMessage",
\'\'\',
    "RETENTION_CHECKER_MOVE_EVIDENCE_STATES",
)
'''
if source.count(move_marker) != 1:
    raise SystemExit(
        f"RETENTION_INSPECTION_MOVE_STATE_SCOPE_INVALID:{source.count(move_marker)}"
    )
source = source.replace(move_marker, move_scoped, 1)

exec(compile(source, "one-time-retention-inspection-patch", "exec"))

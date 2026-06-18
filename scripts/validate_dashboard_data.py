#!/usr/bin/env python3
"""Validate generated Henipavirus dashboard JSON files."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

REQUIRED_TOP_LEVEL = {"schema_version", "generated_at", "stages", "records"}
REQUIRED_RECORD_FIELDS = {
    "id",
    "candidate",
    "species",
    "virus",
    "stage",
    "stage_key",
    "stage_order",
    "platform",
    "sponsor_or_steward",
    "setting",
    "status_summary",
    "next_milestone_or_gap",
    "evidence_class",
    "is_gap",
    "is_clinical",
    "sources",
    "curation_note",
}


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("Top-level JSON must be an object")
    return data


def valid_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def validate(data: dict) -> list[str]:
    errors: list[str] = []
    missing = REQUIRED_TOP_LEVEL - set(data)
    if missing:
        errors.append(f"Missing top-level keys: {', '.join(sorted(missing))}")
    stages = data.get("stages") or []
    if not isinstance(stages, list) or not stages:
        errors.append("stages must be a non-empty list")
    stage_keys = set()
    for stage in stages:
        if not isinstance(stage, dict) or not stage.get("key"):
            errors.append("Each stage must be an object with a key")
            continue
        if stage["key"] in stage_keys:
            errors.append(f"Duplicate stage key: {stage['key']}")
        stage_keys.add(stage["key"])
    records = data.get("records") or []
    if not isinstance(records, list) or not records:
        errors.append("records must be a non-empty list")
        return errors
    record_ids = set()
    for idx, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            errors.append(f"Record {idx} must be an object")
            continue
        rid = record.get("id") or f"record-{idx}"
        if rid in record_ids:
            errors.append(f"Duplicate record id: {rid}")
        record_ids.add(rid)
        missing_record = REQUIRED_RECORD_FIELDS - set(record)
        if missing_record:
            errors.append(f"{rid}: missing fields: {', '.join(sorted(missing_record))}")
        if record.get("stage_key") not in stage_keys:
            errors.append(f"{rid}: undefined stage_key {record.get('stage_key')!r}")
        try:
            int(record.get("stage_order"))
        except Exception:
            errors.append(f"{rid}: stage_order must be an integer")
        if not isinstance(record.get("is_gap"), bool):
            errors.append(f"{rid}: is_gap must be boolean")
        if not isinstance(record.get("is_clinical"), bool):
            errors.append(f"{rid}: is_clinical must be boolean")
        sources = record.get("sources") or []
        if not sources:
            errors.append(f"{rid}: at least one source is required")
        for source in sources:
            if not isinstance(source, dict):
                errors.append(f"{rid}: source must be an object")
                continue
            url = str(source.get("url") or "")
            if not valid_http_url(url):
                errors.append(f"{rid}: invalid source URL {url!r}")
    return errors


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate generated dashboard data JSON.")
    parser.add_argument("--data", default="docs/data/henipavirus_development_pipeline_data.json", type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    errors = validate(load_json(args.data))
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Validated {args.data}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

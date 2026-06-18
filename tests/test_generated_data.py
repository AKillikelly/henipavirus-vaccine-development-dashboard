from __future__ import annotations

import json
from pathlib import Path

import yaml

from scripts.validate_dashboard_data import validate

ROOT = Path(__file__).resolve().parents[1]


def test_pipeline_config_has_unique_record_ids() -> None:
    cfg = yaml.safe_load((ROOT / "config" / "pipeline.yml").read_text(encoding="utf-8"))
    ids = [record["id"] for record in cfg["records"]]
    assert len(ids) == len(set(ids))


def test_generated_json_validates() -> None:
    data = json.loads((ROOT / "docs" / "data" / "henipavirus_development_pipeline_data.json").read_text(encoding="utf-8"))
    assert not validate(data)


def test_every_record_has_source() -> None:
    data = json.loads((ROOT / "docs" / "data" / "henipavirus_development_pipeline_data.json").read_text(encoding="utf-8"))
    for record in data["records"]:
        assert record["sources"], record["id"]
        assert all(source["url"].startswith("http") for source in record["sources"])


def test_curated_stages_are_configured() -> None:
    data = json.loads((ROOT / "docs" / "data" / "henipavirus_development_pipeline_data.json").read_text(encoding="utf-8"))
    stage_keys = {stage["key"] for stage in data["stages"]}
    assert {record["stage_key"] for record in data["records"]} <= stage_keys

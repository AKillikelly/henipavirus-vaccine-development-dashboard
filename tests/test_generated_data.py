from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.validate_dashboard_data import validate  # noqa: E402
DATA_PATH = ROOT / "docs" / "data" / "henipavirus_development_pipeline_data.json"


def load_data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def test_pipeline_config_has_unique_record_ids() -> None:
    cfg = yaml.safe_load((ROOT / "config" / "pipeline.yml").read_text(encoding="utf-8"))
    ids = [record["id"] for record in cfg["records"]]
    assert len(ids) == len(set(ids))


def test_generated_json_validates() -> None:
    assert not validate(load_data())


def test_every_record_has_source() -> None:
    data = load_data()
    for record in data["records"]:
        assert record["sources"], record["id"]
        assert all(source["url"].startswith("http") for source in record["sources"])


def test_curated_stages_are_configured() -> None:
    data = load_data()
    stage_keys = {stage["key"] for stage in data["stages"]}
    assert {record["stage_key"] for record in data["records"]} <= stage_keys
    assert {
        "preclinical",
        "ind_enabling",
        "phase1_started",
        "phase1_completed",
        "phase1_results_published",
        "phase2_planned",
        "phase2_ongoing",
        "licensed_veterinary",
        "surveillance",
    } <= stage_keys


def test_priority_content_updates_are_present() -> None:
    data = load_data()
    records = {record["id"]: record for record in data["records"]}

    assert records["niv-chadox1-phase2-ongoing"]["stage_key"] == "phase2_ongoing"
    assert "ISRCTN62461807" in records["niv-chadox1-phase2-ongoing"].get("trial_registry_ids", [])

    assert records["niv-gennova-sarna-ind-enabling"]["platform_family"].startswith("mRNA")
    assert records["niv-gennova-sarna-ind-enabling"]["stage_key"] == "ind_enabling"

    assert records["niv-mrna1215-phase1-results-published"]["results_publication_date"]
    assert records["niv-hev-sg-phase1-results-published"]["results_publication_date"]

    assert records["hev-equivac-veterinary-licensed"]["program_type"] == "Veterinary vaccine"
    assert records["hev-equivac-veterinary-licensed"]["stage_key"] == "licensed_veterinary"

    surveillance_ids = {
        "cedar-research-surrogate-only",
        "ghv-mojv-angv-surveillance-only",
        "salt-gully-surveillance-only",
    }
    assert all(records[row_id]["stage_key"] == "surveillance" for row_id in surveillance_ids)
    assert all(records[row_id]["is_gap"] is True for row_id in surveillance_ids)


def test_platform_and_therapeutics_sections_have_data() -> None:
    data = load_data()
    records = data["records"]

    platform_text = " | ".join(record.get("platform_family", "") for record in records)
    for expected in ["mRNA", "Viral vector", "Subunit protein", "Virus-like particle", "DNA", "Live attenuated"]:
        assert expected in platform_text

    therapeutics = [record for record in records if "Therapeutic" in record.get("program_type", "")]
    assert {"tx-m1024-phase1-results-published", "tx-mbp1f5-phase1-planned", "tx-remdesivir-preclinical", "tx-favipiravir-preclinical"} <= {record["id"] for record in therapeutics}


def test_source_directories_and_publication_watches_are_exported() -> None:
    data = load_data()
    assert data.get("data_source_sections")
    assert data.get("stage_status_legend")
    assert "publication_statuses" in data

    csv_path = ROOT / "docs" / "data" / "henipavirus_development_pipeline_data.csv"
    assert csv_path.exists()
    header = csv_path.read_text(encoding="utf-8").splitlines()[0]
    assert "program_type" in header
    assert "publication_watch_summary" in header

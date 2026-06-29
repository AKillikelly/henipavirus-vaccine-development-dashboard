#!/usr/bin/env python3
"""Refresh Henipavirus dashboard data from curated config plus monitored public sources.

The updater keeps curated maturity staging separate from automated monitoring. It can
refresh source availability, page titles, ClinicalTrials.gov metadata, publication-search
hits, and review flags on a GitHub Actions schedule without silently promoting a row to
a new maturity stage.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

import requests
import yaml
from bs4 import BeautifulSoup

REQUIRED_RECORD_FIELDS = [
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
]

CSV_FIELDS = [
    "id",
    "candidate",
    "program_type",
    "priority_group",
    "species",
    "virus",
    "lineage_or_scope",
    "stage",
    "stage_key",
    "stage_order",
    "platform_family",
    "platform",
    "modality",
    "sponsor_or_steward",
    "setting",
    "trial_status",
    "clinical_phase_detail",
    "publication_status",
    "trial_start_date",
    "primary_completion_date",
    "completion_date",
    "results_publication_date",
    "trial_registry_ids",
    "trial_locations",
    "funding",
    "reserve_or_stockpile_status",
    "status_summary",
    "next_milestone_or_gap",
    "evidence_class",
    "is_gap",
    "is_clinical",
    "source_titles",
    "source_urls",
    "registry_status_summary",
    "publication_watch_summary",
    "review_flags",
    "curation_note",
]

EUROPE_PMC_ENDPOINT = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in {path}")
    return data


def safe_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "y"}
    return bool(value)


def compact_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, dict)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def flatten_sources(record: dict[str, Any]) -> tuple[str, str]:
    sources = record.get("sources") or []
    titles = []
    urls = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        title = str(source.get("title") or source.get("url") or "").strip()
        url = str(source.get("url") or "").strip()
        if title:
            titles.append(title)
        if url:
            urls.append(url)
    return " | ".join(titles), " | ".join(urls)


def extract_html_title(content: bytes, content_type: str | None) -> str | None:
    if not content:
        return None
    text = content.decode("utf-8", errors="replace")
    if "html" not in (content_type or "").lower() and "<title" not in text.lower():
        return None
    soup = BeautifulSoup(text, "html.parser")
    title = soup.find("title")
    if title and title.get_text(strip=True):
        return html.unescape(re.sub(r"\s+", " ", title.get_text(" ", strip=True))).strip()
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        return html.unescape(re.sub(r"\s+", " ", h1.get_text(" ", strip=True))).strip()
    return None


def limited_get(url: str, *, timeout: int, max_bytes: int, user_agent: str) -> dict[str, Any]:
    started = time.time()
    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
    }
    result: dict[str, Any] = {
        "url": url,
        "checked_at": utc_now(),
        "ok": False,
        "status_code": None,
        "final_url": None,
        "content_type": None,
        "title": None,
        "elapsed_seconds": None,
        "error": None,
    }
    try:
        with requests.get(url, timeout=timeout, allow_redirects=True, headers=headers, stream=True) as response:
            result["status_code"] = response.status_code
            result["ok"] = bool(response.ok)
            result["final_url"] = response.url
            result["content_type"] = response.headers.get("content-type")
            chunks: list[bytes] = []
            remaining = max_bytes
            for chunk in response.iter_content(chunk_size=32768):
                if not chunk:
                    continue
                chunks.append(chunk[:remaining])
                remaining -= len(chunks[-1])
                if remaining <= 0:
                    break
            result["title"] = extract_html_title(b"".join(chunks), result.get("content_type"))
    except Exception as exc:  # noqa: BLE001 - report source failures without crashing update.
        result["error"] = f"{type(exc).__name__}: {exc}"
    result["elapsed_seconds"] = round(time.time() - started, 3)
    return result


def clinicaltrials_v2_url(nct_id: str) -> str:
    return f"https://clinicaltrials.gov/api/v2/studies/{nct_id}"


def parse_date_struct(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("date") or value.get("monthYear") or value.get("year")
    if isinstance(value, str):
        return value
    return None


def fetch_clinicaltrials_gov(nct_id: str, *, timeout: int, user_agent: str) -> dict[str, Any]:
    url = clinicaltrials_v2_url(nct_id)
    result: dict[str, Any] = {
        "system": "ClinicalTrials.gov",
        "type": "clinicaltrials_gov",
        "id": nct_id,
        "api_url": url,
        "checked_at": utc_now(),
        "ok": False,
        "error": None,
    }
    headers = {"User-Agent": user_agent, "Accept": "application/json"}
    try:
        response = requests.get(url, timeout=timeout, headers=headers)
        result["status_code"] = response.status_code
        response.raise_for_status()
        payload = response.json()
        protocol = payload.get("protocolSection", {})
        identification = protocol.get("identificationModule", {})
        status = protocol.get("statusModule", {})
        design = protocol.get("designModule", {})
        description = protocol.get("descriptionModule", {})
        sponsor = protocol.get("sponsorCollaboratorsModule", {})
        arms = protocol.get("armsInterventionsModule", {})
        contacts = protocol.get("contactsLocationsModule", {})
        result.update(
            {
                "ok": True,
                "nct_id": identification.get("nctId") or nct_id,
                "brief_title": identification.get("briefTitle"),
                "official_title": identification.get("officialTitle"),
                "overall_status": status.get("overallStatus"),
                "last_update_submit_date": status.get("lastUpdateSubmitDate"),
                "start_date": parse_date_struct(status.get("startDateStruct")),
                "primary_completion_date": parse_date_struct(status.get("primaryCompletionDateStruct")),
                "completion_date": parse_date_struct(status.get("completionDateStruct")),
                "study_first_submit_date": status.get("studyFirstSubmitDate"),
                "results_first_submit_date": status.get("resultsFirstSubmitDate"),
                "phases": design.get("phases") or [],
                "study_type": design.get("studyType"),
                "enrollment_count": (design.get("enrollmentInfo") or {}).get("count"),
                "enrollment_type": (design.get("enrollmentInfo") or {}).get("type"),
                "brief_summary": description.get("briefSummary"),
                "lead_sponsor": (sponsor.get("leadSponsor") or {}).get("name"),
                "collaborators": [c.get("name") for c in sponsor.get("collaborators", []) if isinstance(c, dict)],
                "locations": [
                    {
                        "facility": loc.get("facility"),
                        "city": loc.get("city"),
                        "state": loc.get("state"),
                        "country": loc.get("country"),
                    }
                    for loc in contacts.get("locations", [])
                    if isinstance(loc, dict)
                ],
                "interventions": [
                    item.get("name")
                    for item in arms.get("interventions", [])
                    if isinstance(item, dict) and item.get("name")
                ],
            }
        )
    except Exception as exc:  # noqa: BLE001
        result["error"] = f"{type(exc).__name__}: {exc}"
    return result


def fetch_europe_pmc(query: str, *, watch: dict[str, Any], timeout: int, user_agent: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "system": watch.get("system") or "Europe PMC",
        "type": "europe_pmc_search",
        "id": watch.get("id") or query,
        "query": query,
        "url": watch.get("url"),
        "api_url": EUROPE_PMC_ENDPOINT,
        "checked_at": utc_now(),
        "ok": False,
        "result_count": None,
        "top_results": [],
        "error": None,
    }
    headers = {"User-Agent": user_agent, "Accept": "application/json"}
    params = {"query": query, "format": "json", "pageSize": 5, "sort": "FIRST_PDATE_D desc"}
    try:
        response = requests.get(EUROPE_PMC_ENDPOINT, params=params, timeout=timeout, headers=headers)
        result["status_code"] = response.status_code
        response.raise_for_status()
        payload = response.json()
        result["ok"] = True
        result["result_count"] = int(payload.get("hitCount") or 0)
        result["top_results"] = [
            {
                "title": item.get("title"),
                "journal": item.get("journalTitle"),
                "year": item.get("pubYear"),
                "pmid": item.get("pmid"),
                "doi": item.get("doi"),
                "source": item.get("source"),
                "first_publication_date": item.get("firstPublicationDate"),
            }
            for item in ((payload.get("resultList") or {}).get("result") or [])
            if isinstance(item, dict)
        ]
    except Exception as exc:  # noqa: BLE001
        result["error"] = f"{type(exc).__name__}: {exc}"
    return result


def source_urls_for_record(record: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    for block in ("sources", "registry_watch", "publication_watch"):
        for item in record.get(block) or []:
            if isinstance(item, dict) and item.get("url"):
                url = str(item["url"]).strip()
                if url and url not in urls:
                    urls.append(url)
    return urls


def normalized_record(record: dict[str, Any]) -> dict[str, Any]:
    # Preserve all content fields from config by default. This makes future curation
    # fields dashboard-visible without needing a script edit, while still normalizing
    # the core schema fields below.
    out: dict[str, Any] = dict(record)
    for key in ["id", "candidate", "species", "virus", "stage", "stage_key"]:
        out[key] = str(out.get(key, "")).strip()
    out["stage_order"] = int(out.get("stage_order") or 0)
    out["is_gap"] = safe_bool(out.get("is_gap"))
    out["is_clinical"] = safe_bool(out.get("is_clinical"))
    out["lineage_or_scope"] = out.get("lineage_or_scope", "")
    out["program_type"] = out.get("program_type", "Human vaccine")
    out["platform_family"] = out.get("platform_family", out.get("platform", ""))
    out["priority_group"] = out.get("priority_group", "")
    out["trial_status"] = out.get("trial_status", "")
    out["publication_status"] = out.get("publication_status", "")
    out["trial_registry_ids"] = out.get("trial_registry_ids", []) or []
    out["trial_locations"] = out.get("trial_locations", []) or []
    out["funding"] = out.get("funding", []) or []
    out["sources"] = [s for s in (out.get("sources") or []) if isinstance(s, dict) and s.get("url")]
    out["registry_watch"] = [w for w in (out.get("registry_watch") or []) if isinstance(w, dict)]
    out["publication_watch"] = [w for w in (out.get("publication_watch") or []) if isinstance(w, dict)]
    out["curation_lock"] = safe_bool(out.get("curation_lock", True))
    return out


def build_source_checks(
    records: list[dict[str, Any]],
    *,
    skip_network: bool,
    timeout: int,
    max_bytes: int,
    user_agent: str,
) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in records:
        for url in source_urls_for_record(record):
            if not url or url in seen:
                continue
            seen.add(url)
            if skip_network:
                parsed = urlparse(url)
                checks.append(
                    {
                        "url": url,
                        "checked_at": utc_now(),
                        "ok": None,
                        "status_code": None,
                        "final_url": url,
                        "content_type": None,
                        "title": None,
                        "elapsed_seconds": None,
                        "error": "network skipped",
                        "domain": parsed.netloc,
                    }
                )
            else:
                check = limited_get(url, timeout=timeout, max_bytes=max_bytes, user_agent=user_agent)
                check["domain"] = urlparse(url).netloc
                checks.append(check)
    return checks


def build_registry_statuses(
    records: list[dict[str, Any]], *, skip_network: bool, timeout: int, user_agent: str
) -> list[dict[str, Any]]:
    statuses: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for record in records:
        for watch in record.get("registry_watch") or []:
            system_type = str(watch.get("type") or "").strip()
            identifier = str(watch.get("id") or "").strip()
            if not system_type or not identifier:
                continue
            key = (system_type, identifier)
            if key in seen:
                continue
            seen.add(key)
            if skip_network:
                statuses.append(
                    {
                        "system": watch.get("system") or system_type,
                        "type": system_type,
                        "id": identifier,
                        "url": watch.get("url"),
                        "checked_at": utc_now(),
                        "ok": None,
                        "error": "network skipped",
                    }
                )
                continue
            if system_type == "clinicaltrials_gov":
                status = fetch_clinicaltrials_gov(identifier, timeout=timeout, user_agent=user_agent)
                status["url"] = watch.get("url")
                statuses.append(status)
            else:
                statuses.append(
                    {
                        "system": watch.get("system") or system_type,
                        "type": system_type,
                        "id": identifier,
                        "url": watch.get("url"),
                        "checked_at": utc_now(),
                        "ok": None,
                        "note": "No structured API adapter configured; source page is monitored through source_checks.",
                    }
                )
    return statuses


def build_publication_statuses(
    records: list[dict[str, Any]], *, skip_network: bool, timeout: int, user_agent: str
) -> list[dict[str, Any]]:
    statuses: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for record in records:
        for watch in record.get("publication_watch") or []:
            system_type = str(watch.get("type") or "").strip()
            query = str(watch.get("query") or watch.get("id") or "").strip()
            if not query:
                continue
            key = (system_type, query)
            if key in seen:
                continue
            seen.add(key)
            if skip_network:
                statuses.append(
                    {
                        "system": watch.get("system") or "Europe PMC",
                        "type": system_type or "europe_pmc_search",
                        "id": watch.get("id") or query,
                        "query": query,
                        "url": watch.get("url"),
                        "checked_at": utc_now(),
                        "ok": None,
                        "result_count": None,
                        "top_results": [],
                        "error": "network skipped",
                    }
                )
                continue
            if system_type == "europe_pmc_search":
                statuses.append(fetch_europe_pmc(query, watch=watch, timeout=timeout, user_agent=user_agent))
            else:
                statuses.append(
                    {
                        "system": watch.get("system") or system_type,
                        "type": system_type,
                        "id": watch.get("id") or query,
                        "query": query,
                        "url": watch.get("url"),
                        "checked_at": utc_now(),
                        "ok": None,
                        "note": "No structured publication adapter configured for this watch type.",
                    }
                )
    return statuses


def flags_for_records(
    records: list[dict[str, Any]],
    source_checks: list[dict[str, Any]],
    registry_statuses: list[dict[str, Any]],
    publication_statuses: list[dict[str, Any]],
    rules: dict[str, Any],
) -> list[dict[str, Any]]:
    by_url = {item.get("url"): item for item in source_checks}
    by_registry = {(item.get("type"), item.get("id")): item for item in registry_statuses}
    by_publication = {(item.get("type"), item.get("query")): item for item in publication_statuses}
    broken_codes = set(rules.get("review_flags", {}).get("broken_source_status_codes", []))
    title_needles = [s.lower() for s in rules.get("review_flags", {}).get("warn_if_source_title_contains", [])]
    terminal = set(rules.get("review_flags", {}).get("clinical_registry_terminal_statuses", []))
    flags: list[dict[str, Any]] = []
    for record in records:
        rid = record["id"]
        for url in source_urls_for_record(record):
            check = by_url.get(url)
            if not check:
                continue
            code = check.get("status_code")
            title = (check.get("title") or "").lower()
            if check.get("error") and check.get("error") != "network skipped":
                flags.append({"record_id": rid, "severity": "warning", "type": "source_error", "message": f"Source fetch error for {url}: {check.get('error')}"})
            if code in broken_codes:
                flags.append({"record_id": rid, "severity": "warning", "type": "source_status", "message": f"Source returned HTTP {code}: {url}"})
            if title and any(needle in title for needle in title_needles):
                flags.append({"record_id": rid, "severity": "review", "type": "source_title", "message": f"Source title may indicate a stale/broken page: {check.get('title')}"})
        for watch in record.get("registry_watch") or []:
            status = by_registry.get((watch.get("type"), watch.get("id")))
            if not status:
                continue
            if status.get("error") and status.get("error") != "network skipped":
                flags.append({"record_id": rid, "severity": "warning", "type": "registry_error", "message": f"Registry fetch error for {watch.get('id')}: {status.get('error')}"})
            overall = status.get("overall_status")
            if overall in terminal and record.get("stage_key") in {"phase1_planned", "phase1_started", "phase2_planned", "phase2_ongoing"}:
                flags.append({"record_id": rid, "severity": "review", "type": "registry_terminal_status", "message": f"{watch.get('id')} reports {overall}; review whether the curated stage still describes the public pathway."})
        for watch in record.get("publication_watch") or []:
            status = by_publication.get((watch.get("type"), watch.get("query")))
            if status and status.get("error") and status.get("error") != "network skipped":
                flags.append({"record_id": rid, "severity": "warning", "type": "publication_watch_error", "message": f"Publication watch error for {watch.get('id')}: {status.get('error')}"})
    return flags


def attach_record_runtime_fields(
    records: list[dict[str, Any]],
    registry_statuses: list[dict[str, Any]],
    publication_statuses: list[dict[str, Any]],
    flags: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_registry = {(item.get("type"), item.get("id")): item for item in registry_statuses}
    by_publication = {(item.get("type"), item.get("query")): item for item in publication_statuses}
    flags_by_record: dict[str, list[dict[str, Any]]] = {}
    for flag in flags:
        flags_by_record.setdefault(str(flag.get("record_id")), []).append(flag)
    enriched: list[dict[str, Any]] = []
    for record in records:
        rec = dict(record)
        rec["registry_statuses"] = [
            by_registry[(watch.get("type"), watch.get("id"))]
            for watch in rec.get("registry_watch") or []
            if (watch.get("type"), watch.get("id")) in by_registry
        ]
        rec["publication_watch_statuses"] = [
            by_publication[(watch.get("type"), watch.get("query"))]
            for watch in rec.get("publication_watch") or []
            if (watch.get("type"), watch.get("query")) in by_publication
        ]
        rec["review_flags"] = flags_by_record.get(rec["id"], [])
        enriched.append(rec)
    return enriched


def registry_summary(record: dict[str, Any]) -> str:
    pieces: list[str] = []
    for status in record.get("registry_statuses") or []:
        label = status.get("id") or status.get("system") or "registry"
        if status.get("overall_status"):
            phases = ", ".join(status.get("phases") or [])
            dates = ", ".join(
                x for x in [
                    f"start {status.get('start_date')}" if status.get("start_date") else "",
                    f"primary completion {status.get('primary_completion_date')}" if status.get("primary_completion_date") else "",
                ] if x
            )
            phrase = f"{label}: {status.get('overall_status')}"
            if phases:
                phrase += f" ({phases})"
            if dates:
                phrase += f"; {dates}"
            pieces.append(phrase)
        elif status.get("note"):
            pieces.append(f"{label}: monitored page")
        elif status.get("error"):
            pieces.append(f"{label}: {status.get('error')}")
    return " | ".join(pieces)


def publication_summary(record: dict[str, Any]) -> str:
    pieces: list[str] = []
    for status in record.get("publication_watch_statuses") or []:
        label = status.get("id") or status.get("query") or "publication watch"
        if status.get("result_count") is not None:
            pieces.append(f"{label}: {status.get('result_count')} Europe PMC hits")
        elif status.get("note"):
            pieces.append(f"{label}: monitored page")
        elif status.get("error"):
            pieces.append(f"{label}: {status.get('error')}")
    return " | ".join(pieces)


def write_outputs(
    cfg: dict[str, Any],
    rules: dict[str, Any],
    records: list[dict[str, Any]],
    source_checks: list[dict[str, Any]],
    registry_statuses: list[dict[str, Any]],
    publication_statuses: list[dict[str, Any]],
    flags: list[dict[str, Any]],
    *,
    out_dir: Path,
    reports_dir: Path,
    skip_network: bool,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    generated_at = utc_now()
    enriched = attach_record_runtime_fields(records, registry_statuses, publication_statuses, flags)
    stages = sorted(cfg.get("stage_definitions") or [], key=lambda x: int(x.get("order", 0)))
    payload = {
        "schema_version": cfg.get("schema_version", "1.0.0"),
        "generated_at": generated_at,
        "generated_by": "scripts/update_dashboard_data.py",
        "update_mode": "offline_skip_network" if skip_network else "network_refresh",
        "dashboard_title": cfg.get("dashboard_title", "Henipavirus Vaccine and Therapeutics Development Dashboard"),
        "dashboard_summary": cfg.get("dashboard_summary", {}),
        "curation_policy": cfg.get("curation_policy", {}),
        "stage_status_legend": cfg.get("stage_status_legend", []),
        "data_source_sections": cfg.get("data_source_sections", []),
        "stages": stages,
        "records": enriched,
        "source_checks": source_checks,
        "registry_statuses": registry_statuses,
        "publication_statuses": publication_statuses,
        "review_flags": flags,
    }
    (out_dir / "henipavirus_development_pipeline_data.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    with (out_dir / "henipavirus_development_pipeline_data.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for rec in enriched:
            titles, urls = flatten_sources(rec)
            row = {field: compact_text(rec.get(field)) for field in CSV_FIELDS}
            row["source_titles"] = titles
            row["source_urls"] = urls
            row["registry_status_summary"] = registry_summary(rec)
            row["publication_watch_summary"] = publication_summary(rec)
            row["review_flags"] = " | ".join(flag.get("message", "") for flag in rec.get("review_flags", []))
            writer.writerow(row)

    if rules.get("output", {}).get("write_source_checks_csv", True):
        fieldnames = ["url", "domain", "checked_at", "ok", "status_code", "final_url", "content_type", "title", "elapsed_seconds", "error"]
        with (out_dir / "source_checks.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for item in source_checks:
                writer.writerow(item)

    if rules.get("output", {}).get("write_registry_status_json", True):
        (out_dir / "clinical_trial_registry_status.json").write_text(
            json.dumps({"generated_at": generated_at, "registry_statuses": registry_statuses}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    (out_dir / "publication_watch_status.json").write_text(
        json.dumps({"generated_at": generated_at, "publication_statuses": publication_statuses}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    last_update = {
        "generated_at": generated_at,
        "update_mode": payload["update_mode"],
        "record_count": len(enriched),
        "source_count": len(source_checks),
        "registry_watch_count": len(registry_statuses),
        "publication_watch_count": len(publication_statuses),
        "review_flag_count": len(flags),
        "program_type_counts": dict(Counter(str(r.get("program_type") or "Unspecified") for r in enriched)),
        "platform_family_counts": dict(Counter(str(r.get("platform_family") or "Unspecified") for r in enriched)),
    }
    (out_dir / "last_update.json").write_text(json.dumps(last_update, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    program_counts = Counter(str(r.get("program_type") or "Unspecified") for r in enriched)
    platform_counts = Counter(str(r.get("platform_family") or "Unspecified") for r in enriched)
    stage_counts = Counter(str(r.get("stage") or "Unspecified") for r in enriched)
    report_lines = [
        "# Dashboard update report",
        "",
        f"Generated: {generated_at}",
        f"Mode: {payload['update_mode']}",
        f"Records: {len(enriched)}",
        f"Sources checked: {len(source_checks)}",
        f"Registry watches: {len(registry_statuses)}",
        f"Publication watches: {len(publication_statuses)}",
        f"Review flags: {len(flags)}",
        "",
        "## Stage counts",
        "",
    ]
    for label, count in sorted(stage_counts.items()):
        report_lines.append(f"- {label}: {count}")
    report_lines.extend(["", "## Program type counts", ""])
    for label, count in sorted(program_counts.items()):
        report_lines.append(f"- {label}: {count}")
    report_lines.extend(["", "## Platform family counts", ""])
    for label, count in sorted(platform_counts.items()):
        report_lines.append(f"- {label}: {count}")
    report_lines.extend(["", "## Review flags", ""])
    if flags:
        for flag in flags:
            report_lines.append(f"- **{flag.get('severity', 'review')}** `{flag.get('record_id')}` — {flag.get('message')}")
    else:
        report_lines.append("No review flags generated in this run.")
    report_lines.extend(["", "## Clinical registry statuses", ""])
    if registry_statuses:
        for status in registry_statuses:
            label = status.get("id") or status.get("system")
            overall = status.get("overall_status") or status.get("note") or status.get("error") or "checked"
            phases = ", ".join(status.get("phases") or [])
            suffix = f" — {phases}" if phases else ""
            report_lines.append(f"- `{label}`: {overall}{suffix}")
    else:
        report_lines.append("No registry watches configured.")
    report_lines.extend(["", "## Publication watches", ""])
    if publication_statuses:
        for status in publication_statuses:
            label = status.get("id") or status.get("query")
            detail = f"{status.get('result_count')} hits" if status.get("result_count") is not None else status.get("error") or status.get("note") or "checked"
            report_lines.append(f"- `{label}`: {detail}")
    else:
        report_lines.append("No publication watches configured.")
    report_lines.extend(["", "## Source domains", ""])
    domains = sorted({item.get("domain") for item in source_checks if item.get("domain")})
    for domain in domains:
        report_lines.append(f"- {domain}")
    (reports_dir / "update_report.md").write_text("\n".join(report_lines) + "\n", encoding="utf-8")


def validate_config_records(records: list[dict[str, Any]], stages: Iterable[dict[str, Any]]) -> None:
    stage_keys = {stage.get("key") for stage in stages}
    seen: set[str] = set()
    errors: list[str] = []
    for idx, record in enumerate(records, start=1):
        rid = record.get("id", f"row-{idx}")
        if rid in seen:
            errors.append(f"Duplicate record id: {rid}")
        seen.add(rid)
        for field in REQUIRED_RECORD_FIELDS:
            if field not in record:
                errors.append(f"{rid}: missing field {field}")
        if record.get("stage_key") not in stage_keys:
            errors.append(f"{rid}: stage_key {record.get('stage_key')} is not defined")
        if not record.get("sources"):
            errors.append(f"{rid}: no sources configured")
        for source in record.get("sources") or []:
            url = str(source.get("url", "")) if isinstance(source, dict) else ""
            if not url.startswith(("http://", "https://")):
                errors.append(f"{rid}: invalid source URL {url!r}")
    if errors:
        raise ValueError("\n".join(errors))


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refresh dashboard data from curated config and monitored sources.")
    parser.add_argument("--config", default="config/pipeline.yml", type=Path, help="Path to curated pipeline YAML.")
    parser.add_argument("--rules", default="config/watch_rules.yml", type=Path, help="Path to watcher rules YAML.")
    parser.add_argument("--out", default="docs/data", type=Path, help="Output data directory.")
    parser.add_argument("--reports", default="reports", type=Path, help="Output reports directory.")
    parser.add_argument("--skip-network", action="store_true", help="Build data files without fetching sources or registries.")
    parser.add_argument("--fail-on-review-flags", action="store_true", help="Exit non-zero when review flags are generated.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    cfg = read_yaml(args.config)
    rules = read_yaml(args.rules) if args.rules.exists() else {}
    http_rules = rules.get("http", {})
    timeout = int(http_rules.get("timeout_seconds", 25))
    max_bytes = int(http_rules.get("max_bytes_per_page", 500000))
    user_agent = str(http_rules.get("user_agent") or "HenipavirusDashboardBot/1.1")
    stages = cfg.get("stage_definitions") or []
    records = [normalized_record(item) for item in (cfg.get("records") or [])]
    validate_config_records(records, stages)
    source_checks = build_source_checks(records, skip_network=args.skip_network, timeout=timeout, max_bytes=max_bytes, user_agent=user_agent)
    registry_statuses = build_registry_statuses(records, skip_network=args.skip_network, timeout=timeout, user_agent=user_agent)
    publication_statuses = build_publication_statuses(records, skip_network=args.skip_network, timeout=timeout, user_agent=user_agent)
    flags = flags_for_records(records, source_checks, registry_statuses, publication_statuses, rules)
    write_outputs(
        cfg,
        rules,
        records,
        source_checks,
        registry_statuses,
        publication_statuses,
        flags,
        out_dir=args.out,
        reports_dir=args.reports,
        skip_network=args.skip_network,
    )
    if args.fail_on_review_flags and flags:
        print(f"Review flags generated: {len(flags)}", file=sys.stderr)
        return 2
    print(
        f"Wrote dashboard data to {args.out} with {len(records)} records, "
        f"{len(source_checks)} source checks, {len(registry_statuses)} registry watches, "
        f"{len(publication_statuses)} publication watches, {len(flags)} flags."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

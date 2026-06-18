# Henipavirus vaccine development pathway dashboard

This repository is a GitHub Pages-ready, self-updating dashboard package for the Henipavirus vaccine development pathway. It turns a curated seed dataset into a static web dashboard and refreshes public-source metadata on a schedule.

## What self-updating means

The automation refreshes:

- source-page availability, HTTP status, redirects, domains, and page titles;
- structured ClinicalTrials.gov metadata for configured NCT IDs;
- source and registry audit files in `docs/data/`;
- visible review flags when a source breaks or registry metadata suggests that a row needs human review.

The automation does **not** silently promote a curated candidate to a higher maturity stage. Stage changes remain curation decisions made in `config/pipeline.yml` so the dashboard does not over-interpret unstructured news pages.

## Repository layout

```text
.github/workflows/update-and-publish.yml  Scheduled refresh + GitHub Pages deploy
.github/workflows/validate.yml            Pull-request/off-main validation
config/pipeline.yml                       Curated dashboard records and stages
config/watch_rules.yml                    Source-check and flag rules
docs/index.html                           Static dashboard entry point
docs/assets/                              CSS and JavaScript
docs/data/                                Generated JSON/CSV/audit outputs
reports/update_report.md                  Latest refresh report
scripts/update_dashboard_data.py          Data refresh script
scripts/validate_dashboard_data.py        Data-schema validator
scripts/build_site.py                     Static-site build/validation shim
tests/                                    Basic data package tests
```

## Quick start on GitHub

1. Create a new GitHub repository.
2. Upload the contents of this package to the repository root.
3. Commit to the default branch, usually `main`.
4. In GitHub, open **Settings → Pages → Build and deployment** and choose **GitHub Actions** as the source.
5. Open **Actions → Update and publish dashboard → Run workflow** to perform the first update/deploy.
6. Edit the weekly cron in `.github/workflows/update-and-publish.yml` if the default Monday 07:23 UTC refresh is not appropriate.

The public site will be served from the `docs/` directory artifact uploaded by the workflow.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate
make install
make update-offline
make validate
make serve
```

Then open `http://localhost:8000`.

Use `make update` to run live source checks and registry refreshes. Use `make update-offline` when working without internet access.

## Editing curated rows

Dashboard rows live in `config/pipeline.yml`. Each record includes curation fields, sources, and optional registry watches.

A minimal row needs:

```yaml
- id: example-row
  candidate: Example vaccine candidate
  species: Henipavirus nipahense
  virus: Nipah virus
  lineage_or_scope: Example scope
  stage: Phase 1 / first-in-human
  stage_key: phase1
  stage_order: 3
  platform: Example platform
  sponsor_or_steward: Example sponsor
  setting: Example trial setting
  status_summary: Public status summary.
  next_milestone_or_gap: Next milestone.
  evidence_class: Public clinical development
  is_gap: false
  is_clinical: true
  sources:
    - title: Example source
      url: https://example.org/source
  registry_watch:
    - system: ClinicalTrials.gov
      type: clinicaltrials_gov
      id: NCT00000000
      url: https://clinicaltrials.gov/study/NCT00000000
  curation_note: Why this row is placed where it is.
  curation_lock: true
```

After edits:

```bash
make update-offline
make validate
```

Commit the updated `config/pipeline.yml`, generated `docs/data/*`, and `reports/update_report.md`.

## Data outputs

The dashboard consumes:

- `docs/data/henipavirus_development_pipeline_data.json` — full data payload, source checks, registry status, review flags;
- `docs/data/henipavirus_development_pipeline_data.csv` — spreadsheet-friendly table;
- `docs/data/source_checks.csv` — source audit log for latest run;
- `docs/data/clinical_trial_registry_status.json` — registry metadata snapshot;
- `docs/data/last_update.json` — compact update metadata.

## Maintenance notes

- Keep source URLs public and stable where possible.
- Add registry watches when a row has a structured registry ID.
- Treat review flags as triage prompts, not automatic facts.
- For a stage promotion, update the curated row, add supporting sources, and explain the curation rationale in `curation_note`.

## License

MIT. See `LICENSE`.

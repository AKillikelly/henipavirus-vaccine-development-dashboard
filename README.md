# Henipavirus vaccine, therapeutics, and veterinary countermeasures dashboard

This repository is a GitHub Pages-ready, self-updating dashboard package for public Henipavirus countermeasure development. It tracks vaccine candidates, therapeutic programs, the licensed veterinary Hendra vaccine, and surveillance-only viruses in one static dashboard.

The dashboard is intentionally curation-led. Automation refreshes source metadata, registry metadata, and publication-watch results, but it does **not** silently promote a candidate to a higher maturity stage without an explicit update in `config/pipeline.yml`.

## What changed in the 2026 content refresh

The current package expands the original vaccine-only dashboard into a broader countermeasure dashboard with:

- granular clinical status lanes: preclinical, IND-enabling, Phase I planned, Phase I started, Phase I completed/results pending, Phase I results published, Phase II planned, Phase II ongoing, Phase III, human licensure, and veterinary licensure;
- ChAdOx1 NipahB moved to **Phase II ongoing**;
- HeV-sG-V / HenipaVax moved to **Phase I results published**;
- mRNA-1215 moved to **Phase I results published**;
- PHV02 kept as **Phase II planned/funded** until a public source confirms Phase II launch/recruitment;
- Gennova self-amplifying mRNA added as an **IND-enabling / clinical-entry preparation** row;
- platform tracker coverage for mRNA, self-amplifying RNA, chimpanzee adenovirus, recombinant VSV, recombinant measles, subunit protein, nanoparticle/subunit, VLP, DNA, live-attenuated/replicating-vector concepts, monoclonal antibodies, and antivirals;
- Cedar virus clarified as a research surrogate/tool, not an active vaccine priority;
- Ghanaian bat/Kumasi, Mojiang, Angavokely, and Salt Gully virus rows clarified as surveillance-only/no active public development;
- a separate approved veterinary countermeasures section for Equivac® HeV;
- a therapeutics section for m102.4, MBP1F5, remdesivir, and favipiravir;
- data-source directory linking to trial registries, CEPI pages, WHO/roadmap sources, publications, and sponsor/institution updates;
- geographic/site cards for trial, manufacturing, preclinical, veterinary, and surveillance contexts;
- publication-watch output via Europe PMC search.

## What self-updating means

The automation refreshes:

- source-page availability, HTTP status, redirects, domains, and page titles;
- structured ClinicalTrials.gov v2 metadata for configured NCT IDs;
- Europe PMC publication-watch counts for configured candidate/topic searches;
- generated JSON, CSV, source audit, registry-status, publication-watch, and update-report files;
- visible review flags when a source breaks or registry metadata suggests curation review.

The automation does **not** do these things automatically:

- promote a candidate from one stage to another;
- infer that a press release equals trial completion;
- convert veterinary licensure into human licensure;
- convert surveillance-only species into active product programs.

For those changes, edit `config/pipeline.yml`, add public sources, then run the workflow.

## Repository layout

```text
.github/workflows/update-and-publish.yml  Scheduled refresh + GitHub Pages deploy
.github/workflows/validate.yml            Pull-request/off-main validation
config/pipeline.yml                       Curated dashboard records, stages, source directory
config/watch_rules.yml                    Source-check, registry, and output rules
docs/index.html                           Static dashboard entry point
docs/assets/                              CSS and JavaScript
docs/data/                                Generated JSON/CSV/audit outputs
reports/update_report.md                  Latest refresh report
scripts/update_dashboard_data.py          Data refresh script
scripts/validate_dashboard_data.py        Data-schema validator
scripts/build_site.py                     Static-site build/validation shim
tests/                                    Data package tests
CONTENT_UPDATE_INSTRUCTIONS.md            Beginner replacement instructions for existing repos
UPDATE_NOTES_2026-06-29.md                Details of this content update
```

## Quick start on GitHub

1. Create a new GitHub repository.
2. Upload the contents of this package to the repository root. The top level of the repository should contain `.github`, `config`, `docs`, `scripts`, `tests`, `README.md`, and `requirements.txt`.
3. Commit to the default branch, usually `main`.
4. In GitHub, open **Settings → Actions → General**. Under **Workflow permissions**, choose **Read and write permissions**, then save.
5. Open **Settings → Pages → Build and deployment** and choose **GitHub Actions** as the source.
6. Open **Actions → Update and publish dashboard → Run workflow**.
7. For the first test, set `skip_network` to `true`. After that green-checks, run it again with `skip_network` set to `false` so GitHub can check live sources and registries.
8. Open **Settings → Pages** and click the published site URL.

The public site is deployed from the `docs/` directory artifact uploaded by the workflow.

## Updating an existing dashboard repository

Use the update patch ZIP, or copy these paths from this package into the same paths in your repository:

```text
.github/workflows/update-and-publish.yml
.github/workflows/validate.yml
config/pipeline.yml
config/watch_rules.yml
docs/index.html
docs/assets/app.js
docs/assets/styles.css
docs/data/*
reports/update_report.md
scripts/update_dashboard_data.py
tests/test_generated_data.py
README.md
QUICKSTART_GITHUB.md
CONTENT_UPDATE_INSTRUCTIONS.md
UPDATE_NOTES_2026-06-29.md
```

Then commit and run **Actions → Update and publish dashboard**.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python scripts/update_dashboard_data.py --skip-network
python scripts/validate_dashboard_data.py
python scripts/build_site.py
python -m http.server 8000 --directory docs
```

Then open `http://localhost:8000`.

Use this for live source checks and registry/publication refreshes:

```bash
python scripts/update_dashboard_data.py
python scripts/validate_dashboard_data.py
python scripts/build_site.py
pytest -q
```

## Editing curated rows

Dashboard rows live in `config/pipeline.yml`. Edit that file, not `docs/data/*.json` directly. Generated files are rebuilt by the updater.

A row should include curation fields, stage fields, program type, platform family, sources, optional registry watches, optional publication watches, locations, funding, and a curation note.

Example skeleton:

```yaml
- id: example-row
  candidate: Example vaccine candidate
  program_type: Human vaccine
  priority_group: Nipah / Hendra priority
  species: Henipavirus nipahense
  virus: Nipah virus
  lineage_or_scope: Example scope
  stage: Phase I planned / registered
  stage_key: phase1_planned
  stage_order: 4
  platform_family: mRNA
  platform: Example platform detail
  modality: Vaccine
  sponsor_or_steward: Example sponsor
  setting: Example trial setting
  trial_status: Planned / registered
  clinical_phase_detail: Public phase details.
  publication_status: No results yet
  trial_start_date: ""
  primary_completion_date: ""
  completion_date: ""
  results_publication_date: ""
  trial_registry_ids:
    - NCT00000000
  trial_locations:
    - country: Example country
      city: Example city
      site: Example site
      role: Phase I clinical trial
      population: Healthy adult volunteers
  funding:
    - funder: Example funder
      amount: null
      currency: USD
      unit: ""
      grant_or_award: Example award
      note: Amount not public
  reserve_or_stockpile_status: Not specified
  status_summary: Public status summary.
  next_milestone_or_gap: Next milestone.
  evidence_class: Public clinical development
  is_gap: false
  is_clinical: true
  sources:
    - title: Example source
      url: https://example.org/source
      source_type: Registry
  registry_watch:
    - system: ClinicalTrials.gov
      type: clinicaltrials_gov
      id: NCT00000000
      url: https://clinicaltrials.gov/study/NCT00000000
  publication_watch:
    - id: example-watch
      query: "Example candidate Nipah vaccine"
  curation_note: Why this row is placed where it is.
  curation_lock: true
```

After edits:

```bash
python scripts/update_dashboard_data.py --skip-network
python scripts/validate_dashboard_data.py
python scripts/build_site.py
pytest -q
```

Commit the updated `config/pipeline.yml`, generated `docs/data/*`, and `reports/update_report.md`.

## Data outputs

The dashboard consumes:

- `docs/data/henipavirus_development_pipeline_data.json` — full data payload, source checks, registry statuses, publication statuses, review flags, source directory, stage legend;
- `docs/data/henipavirus_development_pipeline_data.csv` — spreadsheet-friendly table;
- `docs/data/source_checks.csv` — source audit log for latest run;
- `docs/data/clinical_trial_registry_status.json` — registry metadata snapshot;
- `docs/data/publication_watch_status.json` — publication-watch metadata snapshot;
- `docs/data/last_update.json` — compact update metadata.

## Maintenance notes

- Keep source URLs public and stable where possible.
- Add ClinicalTrials.gov registry watches for NCT IDs.
- Add publication watches for every clinical candidate and major preclinical platform.
- Treat review flags as triage prompts, not automatic facts.
- For a stage promotion, update the curated row, add supporting sources, and explain the rationale in `curation_note`.
- Keep surveillance-only species clearly separated from active product programs.

## License

MIT. See `LICENSE`.

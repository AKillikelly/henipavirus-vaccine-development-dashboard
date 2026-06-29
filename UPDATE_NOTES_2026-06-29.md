# Content update notes — 2026-06-29

This update implements the requested dashboard content changes and expands the original vaccine-only view into a countermeasure dashboard.

## Clinical-trial status updates

- ChAdOx1 NipahB is now curated as **Phase II ongoing**.
- PHV02 is curated as **Phase II planned / funded** until public registry or sponsor sources confirm Phase II launch/recruitment.
- HeV-sG-V / HenipaVax is now curated as **Phase I results published**, with a 2025-12-13 Lancet publication date.
- mRNA-1215 is now curated as **Phase I results published**, with Phase I completion and publication status separated.
- Gennova self-amplifying mRNA has been added as an **IND-enabling / clinical-entry preparation** row.

## Platform tracker expansion

The dashboard now includes platform coverage for:

- mRNA and self-amplifying RNA;
- viral vector — chimpanzee adenovirus;
- viral vector — recombinant VSV;
- viral vector — recombinant measles;
- subunit protein;
- nanoparticle/subunit display;
- virus-like particle;
- DNA vaccine / DNA-launched biologics;
- live-attenuated / replicating-vector concepts;
- therapeutic monoclonal antibodies;
- therapeutic small molecules / antivirals.

## Species and virus coverage changes

- Nipah and Hendra remain the active public-health countermeasure priorities.
- Cedar virus is labelled as a research surrogate/tool, not an active vaccine-development priority.
- Ghanaian bat/Kumasi, Mojiang, Angavokely, and Salt Gully are labelled surveillance-only/no active public development.
- Human Hendra vaccine development is listed as an indication gap separate from the Equivac® HeV veterinary product.

## New dashboard sections

The static dashboard now includes:

- platform tracker;
- clinical status tracker;
- geographic/site map;
- approved veterinary countermeasures;
- therapeutics pipeline;
- data-source directory;
- granular stage definitions and status legend.

## Automation changes

- Added Europe PMC publication-watch support.
- Exported `docs/data/publication_watch_status.json`.
- Added richer CSV fields for program type, platform family, registry IDs, locations, funding, trial dates, and publication status.
- Updated GitHub Actions workflow to current major versions with Node.js 24 opt-in.
- Added tests for ChAdOx1 Phase II, Gennova saRNA, published-results statuses, surveillance-only rows, platform coverage, therapeutics, and source-directory export.

## Files changed

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

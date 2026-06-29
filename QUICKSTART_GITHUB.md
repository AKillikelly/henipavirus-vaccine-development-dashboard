# GitHub publishing quickstart

Use this file when you are uploading the dashboard to GitHub for the first time or replacing files in an existing repository.

## Fresh repository setup

1. Download and unzip the full repository ZIP.
2. Open the unzipped folder until you see `.github`, `config`, `docs`, `scripts`, `tests`, `README.md`, and `requirements.txt`.
3. Upload those items to the root of a new GitHub repository.
4. Do not upload the ZIP file itself.
5. Do not upload an extra wrapper folder that contains everything else.

Correct top-level structure:

```text
your-repository/
├── .github/
├── config/
├── docs/
├── scripts/
├── tests/
├── README.md
└── requirements.txt
```

Incorrect structure:

```text
your-repository/
└── henipavirus_self_updating_github/
    ├── .github/
    ├── config/
    └── docs/
```

## GitHub settings

1. Open **Settings → Actions → General**.
2. Under **Workflow permissions**, select **Read and write permissions**.
3. Click **Save**.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, select **GitHub Actions** as the source.

## First workflow run

1. Open **Actions → Update and publish dashboard**.
2. Click **Run workflow**.
3. For the first test, choose `skip_network = true`.
4. Click the green **Run workflow** button.
5. Wait for a green check mark.
6. Run it again with `skip_network = false` to refresh live sources, ClinicalTrials.gov, and Europe PMC publication watches.

## Existing repository update

Use the patch ZIP. After unzipping it, upload the included folders/files into the same paths in your GitHub repository.

The most important files are:

```text
.github/workflows/update-and-publish.yml
.github/workflows/validate.yml
config/pipeline.yml
config/watch_rules.yml
docs/index.html
docs/assets/app.js
docs/assets/styles.css
scripts/update_dashboard_data.py
tests/test_generated_data.py
```

Also upload the generated data and instructions:

```text
docs/data/*
reports/update_report.md
README.md
QUICKSTART_GITHUB.md
CONTENT_UPDATE_INSTRUCTIONS.md
UPDATE_NOTES_2026-06-29.md
```

Commit directly to the default branch, usually `main`, then run the workflow.

## Updating the refresh schedule

Open `.github/workflows/update-and-publish.yml` and edit:

```yaml
schedule:
  - cron: "23 7 * * 1"
```

The default schedule is every Monday at 07:23 UTC.

## Local test before pushing

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/update_dashboard_data.py --skip-network
python scripts/validate_dashboard_data.py
python scripts/build_site.py
pytest -q
python -m http.server 8000 --directory docs
```

Open `http://localhost:8000`.

## Where to edit dashboard content

Edit `config/pipeline.yml`, not `docs/data/*.json` directly. The generated files are rebuilt by the updater.

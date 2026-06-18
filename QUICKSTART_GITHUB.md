# GitHub publishing quickstart

## One-time setup

1. Unzip this package.
2. Push all files to a new GitHub repository.
3. In the repository, go to **Settings → Pages**.
4. Under **Build and deployment**, select **GitHub Actions**.
5. Open **Actions → Update and publish dashboard** and run the workflow manually once.

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
python -m http.server 8000 --directory docs
```

Open `http://localhost:8000`.

## Where to edit dashboard content

Edit `config/pipeline.yml`, not `docs/data/*.json` directly. The generated files are rebuilt by the updater.

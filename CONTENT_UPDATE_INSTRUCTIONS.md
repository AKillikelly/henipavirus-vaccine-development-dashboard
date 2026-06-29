# Beginner instructions for applying the Henipavirus dashboard content update

Use these instructions if you already created a GitHub repository and want to replace the existing files with the updated dashboard content.

## Which download should I use?

Use the **patch ZIP** if your GitHub repository already exists.

Use the **full repository ZIP** only if you are starting over with a new repository.

## What the patch ZIP contains

The patch ZIP contains only the files that need to be replaced or added. It preserves the same folder paths used by GitHub:

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

## Step-by-step GitHub upload

1. Download the patch ZIP.
2. Unzip it on your computer.
3. Open your GitHub repository in your browser.
4. Click the **Code** tab.
5. Click **Add file**.
6. Click **Upload files**.
7. Drag the contents of the unzipped patch folder into the upload area.
8. Make sure GitHub shows files under paths such as `.github/workflows/update-and-publish.yml`, `config/pipeline.yml`, and `docs/index.html`.
9. Scroll down to **Commit changes**.
10. Use the commit message `Apply Henipavirus dashboard content update`.
11. Choose **Commit directly to the main branch**.
12. Click **Commit changes**.

## Important hidden-folder note

The `.github` folder starts with a period, so some computers hide it.

On Mac, press:

```text
Command + Shift + .
```

On Windows, enable:

```text
View → Show → Hidden items
```

If `.github/workflows/update-and-publish.yml` is missing, GitHub Actions will not see the workflow.

## Check repository settings

After committing the files:

1. Open **Settings → Actions → General**.
2. Under **Workflow permissions**, choose **Read and write permissions**.
3. Click **Save**.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, set **Source** to **GitHub Actions**.

## Run the updated workflow

1. Open the **Actions** tab.
2. Click **Update and publish dashboard** in the left sidebar.
3. Click **Run workflow**.
4. For the first test, set `skip_network` to `true`.
5. Click the green **Run workflow** button.
6. Wait for a green check mark.
7. Run the workflow a second time with `skip_network` set to `false`.

The first run proves the static dashboard builds from included data. The second run lets GitHub check live sources, ClinicalTrials.gov, and Europe PMC publication watches.

## How to confirm the update worked

Open your published dashboard and check for these new sections:

```text
Platform tracker
Clinical status tracker
Geographic / site map
Approved veterinary countermeasures
Therapeutics pipeline
Data sources
Stage definitions
```

Also check that:

- ChAdOx1 NipahB appears in **Phase II ongoing**.
- Gennova self-amplifying mRNA appears in **IND-enabling / clinical-entry preparation**.
- HeV-sG-V and mRNA-1215 appear in **Phase I results published**.
- Equivac® HeV appears only in **Approved veterinary countermeasures**.
- Cedar, Ghanaian bat/Kumasi, Mojiang, Angavokely, and Salt Gully are marked surveillance-only or research-tool only.
- Therapeutics rows appear for m102.4, MBP1F5, remdesivir, and favipiravir.

## If the workflow shows a red X

Click the failed run, open the first failed step, and read the visible error. Common causes are:

- files uploaded one folder too deep;
- `.github` folder missing;
- GitHub Pages source not set to GitHub Actions;
- workflow permissions not set to read/write;
- a source site timed out during live checking.

For source timeouts, rerun the workflow with `skip_network = true` to confirm the site itself still builds.

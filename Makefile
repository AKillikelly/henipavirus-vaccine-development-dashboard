.PHONY: install update update-offline validate serve package

install:
	python -m pip install --upgrade pip && python -m pip install -r requirements.txt

update:
	python scripts/update_dashboard_data.py --config config/pipeline.yml --rules config/watch_rules.yml --out docs/data --reports reports

update-offline:
	python scripts/update_dashboard_data.py --config config/pipeline.yml --rules config/watch_rules.yml --out docs/data --reports reports --skip-network

validate:
	python scripts/validate_dashboard_data.py --data docs/data/henipavirus_development_pipeline_data.json
	python scripts/build_site.py --site docs
	python -m pytest

serve:
	python -m http.server 8000 --directory docs

package:
	cd .. && zip -r henipavirus_self_updating_github.zip henipavirus_self_updating_github -x "*/.git/*" "*/__pycache__/*"

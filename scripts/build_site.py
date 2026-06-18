#!/usr/bin/env python3
"""Lightweight site build step for local use and CI.

The dashboard is a static site in docs/. This script exists so the workflow has a
single build command if you later add preprocessing, minification, or alternate
output directories. It currently validates that the required site files exist.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REQUIRED_FILES = [
    "index.html",
    "assets/app.js",
    "assets/styles.css",
    "data/henipavirus_development_pipeline_data.json",
    "data/henipavirus_development_pipeline_data.csv",
]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate/copy static dashboard site files.")
    parser.add_argument("--site", type=Path, default=Path("docs"), help="Static site directory.")
    args = parser.parse_args(argv or sys.argv[1:])
    missing = [item for item in REQUIRED_FILES if not (args.site / item).exists()]
    if missing:
        for item in missing:
            print(f"Missing required site file: {args.site / item}", file=sys.stderr)
        return 1
    print(f"Site ready in {args.site.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

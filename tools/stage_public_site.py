#!/usr/bin/env python3
"""Stage website/ into a public-site directory without tests or private files."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORE = shutil.ignore_patterns(
    "downloads",
    "*.test.js",
    "*.test.mjs",
    "*.test.cjs",
    "*.apk",
    "*.aab",
    "*.zip",
    "*.dmg",
    "*.ipa",
    "*.exe",
    "*.msi",
    ".env*",
    "*.key",
    "*.pem",
    "*.pfx",
    "CNAME",
)


def stage(destination: Path) -> Path:
    destination = destination.resolve()
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(ROOT / "website", destination, ignore=IGNORE)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, nargs="?", default=ROOT / ".public-site")
    args = parser.parse_args()
    print(stage(args.destination))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

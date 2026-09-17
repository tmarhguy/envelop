#!/usr/bin/env python3
"""Guard Envelop documentation and the private-repository/public-site boundary."""

from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "website"
CANONICAL_PREFIX = "https://tmarhguy.github.io/envelop/"
SKIP_DIRS = {".git", ".gradle", ".build", ".swiftpm", "build", "node_modules", "downloads"}
IMAGE_SUFFIXES = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024
PRIVATE_SUFFIXES = {".aab", ".apk", ".dmg", ".exe", ".ipa", ".msi", ".zip"}


class DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[tuple[str, str]] = []
        self.images: list[dict[str, str | None]] = []
        self.meta: list[dict[str, str | None]] = []
        self.links: list[dict[str, str | None]] = []
        self.title_depth = 0
        self.title = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        for key in ("href", "src", "poster"):
            if data.get(key):
                self.refs.append((key, data[key] or ""))
        if tag == "img":
            self.images.append(data)
        elif tag == "meta":
            self.meta.append(data)
        elif tag == "link":
            self.links.append(data)
        elif tag == "title":
            self.title_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.title_depth = max(0, self.title_depth - 1)

    def handle_data(self, data: str) -> None:
        if self.title_depth:
            self.title += data


def files_under(root: Path, suffixes: set[str], skip: set[str] = SKIP_DIRS) -> list[Path]:
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file()
        and path.suffix.lower() in suffixes
        and not any(part in skip for part in path.relative_to(root).parts)
    )


def local_target(source: Path, raw: str) -> Path | None:
    value = unquote(raw.strip())
    split = urlsplit(value)
    if not value or split.scheme or split.netloc or value.startswith(("mailto:", "tel:", "data:", "#")):
        return None
    clean = split.path
    if not clean:
        return None
    if clean.startswith("/envelop/"):
        target = SITE / clean.removeprefix("/envelop/")
    elif clean.startswith("/"):
        target = SITE / clean.lstrip("/")
    else:
        target = source.parent / clean
    target = target.resolve()
    if source.is_relative_to(SITE) and target.is_dir():
        target /= "index.html"
    return target


def expected_url(rel: str) -> str:
    if rel == "index.html":
        return CANONICAL_PREFIX
    if rel.endswith("/index.html"):
        return CANONICAL_PREFIX + rel.removesuffix("index.html")
    return CANONICAL_PREFIX + rel


def markdown_checks(errors: list[str]) -> None:
    pattern = re.compile(r"!?\[[^\]]*]\(([^)\s]+)(?:\s+['\"][^)]*['\"])?\)")
    roots = [ROOT / "README.md", ROOT / "docs", ROOT / "android", ROOT / "apple", ROOT / "backend", ROOT / "protocol"]
    markdown: list[Path] = []
    for item in roots:
        if item.is_file():
            markdown.append(item)
        elif item.is_dir():
            markdown.extend(files_under(item, {".md"}))
    for path in markdown:
        text = path.read_text(encoding="utf-8")
        for raw in pattern.findall(text):
            target = local_target(path, raw)
            if target and not target.exists():
                errors.append(f"{path.relative_to(ROOT)}: missing Markdown target {raw}")


def site_checks(errors: list[str]) -> list[Path]:
    pages = files_under(SITE, {".html"})
    site_root = SITE.resolve()
    required_nav = ("chat/", "status.html", "platforms.html", "privacy.html", "tomato.tmarhguy.com")
    for page in pages:
        rel = page.relative_to(SITE).as_posix()
        text = page.read_text(encoding="utf-8")
        parser = DocumentParser()
        parser.feed(text)
        for key, raw in parser.refs:
            lower = raw.lower()
            if any(lower.split("?", 1)[0].endswith(suffix) for suffix in PRIVATE_SUFFIXES):
                errors.append(f"website/{rel}: public reference to private/native artifact {raw}")
            if "github.com/tmarhguy/envelop" in lower:
                errors.append(f"website/{rel}: public link exposes private repository {raw}")
            target = local_target(page, raw)
            if target and (target != site_root and site_root not in target.parents):
                errors.append(f"website/{rel}: {key} escapes website/: {raw}")
            elif target and not target.exists():
                errors.append(f"website/{rel}: missing {key} target {raw}")
        for image in parser.images:
            if "alt" not in image:
                errors.append(f"website/{rel}: image is missing an alt attribute ({image.get('src', '?')})")
        if rel != "404.html":
            metas = {(m.get("name") or m.get("property")): m.get("content") for m in parser.meta}
            canonicals = [link.get("href") for link in parser.links if link.get("rel") == "canonical"]
            for key in ("description", "viewport", "og:title", "og:description", "og:url", "og:image", "og:image:alt"):
                if not metas.get(key):
                    errors.append(f"website/{rel}: missing metadata {key}")
            if not parser.title.strip():
                errors.append(f"website/{rel}: missing title")
            expected = expected_url(rel)
            if canonicals != [expected]:
                errors.append(f"website/{rel}: canonical must be {expected}")
            for nav_item in required_nav:
                if nav_item not in text:
                    errors.append(f"website/{rel}: missing shared navigation destination {nav_item}")
    return pages


def sitemap_checks(errors: list[str], pages: list[Path]) -> None:
    try:
        tree = ET.parse(SITE / "sitemap.xml")
    except (ET.ParseError, OSError) as exc:
        errors.append(f"website/sitemap.xml: {exc}")
        return
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    actual = {node.text for node in tree.findall(".//sm:loc", ns)}
    expected = {
        expected_url(rel)
        for page in pages
        if (rel := page.relative_to(SITE).as_posix()) != "404.html"
    }
    if actual != expected:
        errors.append(
            "website/sitemap.xml: parity failure; "
            f"missing={sorted(expected - actual)}, extra={sorted(actual - expected)}"
        )


def policy_checks(errors: list[str], public_root: Path | None) -> None:
    current = [ROOT / "README.md"] + files_under(ROOT / "docs", {".md"})
    current += files_under(SITE, {".html", ".css", ".js", ".mjs", ".cjs"})
    stale = {
        r"\bpublic (?:Android|APK|native) download (?:is|now|available)\b": "public native-app claim",
        r"\bautomatic virtual (?:fallback|replay)\b": "unsafe automatic-fallback claim",
    }
    for path in current:
        text = path.read_text(encoding="utf-8")
        for pattern, label in stale.items():
            if re.search(pattern, text, re.IGNORECASE):
                errors.append(f"{path.relative_to(ROOT)}: {label}")
    status = (ROOT / "docs" / "status.md").read_text(encoding="utf-8")
    for required in ("private Android 0.2.0", "never queued"):
        if required not in status:
            errors.append(f"docs/status.md: missing canonical boundary {required!r}")
    for path in files_under(SITE, IMAGE_SUFFIXES):
        if path.stat().st_size > MAX_IMAGE_BYTES:
            errors.append(
                f"{path.relative_to(ROOT)}: image is {path.stat().st_size} bytes "
                f"(limit {MAX_IMAGE_BYTES})"
            )
    if public_root:
        for path in public_root.rglob("*"):
            if path.is_file() and (
                path.suffix.lower() in PRIVATE_SUFFIXES
                or path.name in {".env", ".env.local", "local.properties"}
                or path.suffix.lower() in {".key", ".pem", ".pfx"}
            ):
                errors.append(f"{path}: private/native artifact in staged public site")


def workflow_checks(errors: list[str]) -> None:
    use_re = re.compile(r"^\s*uses:\s*[^@\s]+@([^\s#]+)", re.MULTILINE)
    for path in sorted((ROOT / ".github" / "workflows").glob("*.y*ml")):
        text = path.read_text(encoding="utf-8")
        if "\t" in text:
            errors.append(f"{path.relative_to(ROOT)}: tab character in workflow")
        for ref in use_re.findall(text):
            if not re.fullmatch(r"[0-9a-f]{40}", ref):
                errors.append(f"{path.relative_to(ROOT)}: action is not pinned to a commit ({ref})")
        if not re.search(r"^name:\s*\S", text, re.MULTILINE) or not re.search(
            r"^jobs:\s*$", text, re.MULTILINE
        ):
            errors.append(f"{path.relative_to(ROOT)}: missing top-level name/jobs")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-root", type=Path, help="also inspect a staged Pages artifact")
    args = parser.parse_args()
    errors: list[str] = []
    markdown_checks(errors)
    pages = site_checks(errors)
    sitemap_checks(errors, pages)
    policy_checks(errors, args.public_root.resolve() if args.public_root else None)
    workflow_checks(errors)
    if errors:
        print("Documentation guardrails failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"PASS: documentation, public site, and private-artifact boundary ({len(pages)} HTML pages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

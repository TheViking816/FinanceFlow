#!/usr/bin/env python3
import csv
import io
import os
import re
import sys
import time
import json
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import requests
from slugify import slugify
from PIL import Image

# -----------------------------
# Config
# -----------------------------
INPUT_CSV = os.environ.get("INPUT_CSV", "portfolio_dividends.csv")
OUT_DIR = Path(os.environ.get("OUT_DIR", "logos"))
OUT_ZIP = os.environ.get("OUT_ZIP", "logos.zip")

# Optional (if you have it): https://logo.dev
LOGODEV_TOKEN = os.environ.get("LOGODEV_TOKEN", "").strip()

# User-Agent to reduce blocks
UA = os.environ.get("UA", "Mozilla/5.0 (compatible; LogoFetcher/1.0; +https://example.com)")

# Basic rate limiting to be polite
SLEEP_SECONDS = float(os.environ.get("SLEEP_SECONDS", "0.3"))

# 256x256 output
TARGET_SIZE = int(os.environ.get("TARGET_SIZE", "256"))

# -----------------------------
# Helpers
# -----------------------------
def http_get(url: str, timeout=20):
    headers = {"User-Agent": UA, "Accept": "*/*"}
    r = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
    r.raise_for_status()
    return r

def parse_yahoo_quote_url(source_url: str) -> str | None:
    """
    Accepts:
      https://finance.yahoo.com/quote/MSFT
      https://finance.yahoo.com/quote/UNA.AS
    Returns symbol used in Yahoo endpoints: MSFT / UNA.AS
    """
    if not source_url:
        return None
    try:
        p = urlparse(source_url)
        if "finance.yahoo.com" not in p.netloc:
            return None
        m = re.search(r"/quote/([^/?#]+)", p.path)
        return m.group(1) if m else None
    except Exception:
        return None

def yahoo_quote_summary(symbol: str) -> dict | None:
    """
    Uses public Yahoo Finance quoteSummary endpoint (unofficial but widely used).
    """
    url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
    params = {"modules": "price,summaryProfile"}
    headers = {"User-Agent": UA, "Accept": "application/json"}
    r = requests.get(url, headers=headers, params=params, timeout=20)
    if r.status_code != 200:
        return None
    data = r.json()
    try:
        result = data["quoteSummary"]["result"][0]
        return result
    except Exception:
        return None

def extract_company_name(summary: dict) -> str | None:
    # Prefer longName, then shortName
    try:
        price = summary.get("price", {})
        ln = price.get("longName", "")
        sn = price.get("shortName", "")
        name = (ln or sn).strip()
        return name or None
    except Exception:
        return None

def extract_website_domain(summary: dict) -> str | None:
    try:
        profile = summary.get("summaryProfile", {})
        website = (profile.get("website") or "").strip()
        if not website:
            return None
        d = urlparse(website).netloc.lower()
        d = d.replace("www.", "")
        return d or None
    except Exception:
        return None

def safe_ext_from_content_type(ct: str) -> str:
    ct = (ct or "").lower()
    if "svg" in ct:
        return ".svg"
    if "png" in ct:
        return ".png"
    if "webp" in ct:
        return ".webp"
    if "jpeg" in ct or "jpg" in ct:
        return ".jpg"
    return ""

def ensure_square_256(img_bytes: bytes) -> bytes:
    """
    Converts to PNG 256x256 with transparent background when possible.
    - If input is PNG/JPG/WEBP, we convert to RGBA, pad to square, resize.
    """
    with Image.open(io.BytesIO(img_bytes)) as im:
        im = im.convert("RGBA")
        w, h = im.size
        side = max(w, h)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(im, ((side - w) // 2, (side - h) // 2))
        canvas = canvas.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)

        out = io.BytesIO()
        canvas.save(out, format="PNG", optimize=True)
        return out.getvalue()

def download_logo(symbol: str, domain: str | None) -> tuple[bytes | None, str | None]:
    """
    Try multiple sources:
      1) Clearbit by domain (best transparent PNG often)
      2) logo.dev by ticker (if token provided)
      3) logo.dev by domain (if token provided)
      4) faviconkit by domain (fallback)
      5) Yahoo Finance logo (not always)
    Returns (bytes, source_url_used) or (None, None)
    """
    attempts = []

    if domain:
        attempts.append(f"https://logo.clearbit.com/{domain}")
    if LOGODEV_TOKEN:
        # logo.dev supports ticker-based assets in many plans
        attempts.append(f"https://img.logo.dev/ticker/{symbol}?token={LOGODEV_TOKEN}&format=png")
        if domain:
            attempts.append(f"https://img.logo.dev/{domain}?token={LOGODEV_TOKEN}&format=png")
    if domain:
        attempts.append(f"https://api.faviconkit.com/{domain}/256")

    # Try
    for url in attempts:
        try:
            r = http_get(url)
            ct = r.headers.get("Content-Type", "")
            # Some services may return HTML for not found
            if "text/html" in (ct or "").lower():
                continue
            content = r.content
            if not content or len(content) < 200:
                continue

            # Convert to 256 PNG always (uniform output)
            png_bytes = ensure_square_256(content)
            return png_bytes, url
        except Exception:
            continue

    return None, None

def read_csv_rows(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = [r for r in reader]
    if not rows:
        raise RuntimeError("CSV vacío o inválido.")
    if "ticker" not in rows[0]:
        raise RuntimeError("El CSV debe tener columna 'ticker'.")
    return rows

def build_zip_from_dir(folder: Path, zip_path: str):
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in sorted(folder.glob("*")):
            if p.is_file():
                z.write(p, arcname=p.name)

def main():
    rows = read_csv_rows(INPUT_CSV)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = []
    for i, row in enumerate(rows, start=1):
        ticker = (row.get("ticker") or "").strip()
        src = (row.get("source_url") or "").strip()

        if not ticker:
            continue

        # Yahoo symbol from the source_url if possible, else derive from ticker
        # Your tickers are like NASDAQ:MSFT, BME:ACS, etc.
        # Yahoo typically uses MSFT, ACS.MC, UNA.AS, etc.
        # We'll prefer parsing from the Yahoo URL in CSV; if missing, try best-effort mapping.
        symbol = parse_yahoo_quote_url(src)
        if not symbol:
            # best effort: map prefix to Yahoo suffixes
            # BME:XXX -> XXX.MC, AMS:XXX -> XXX.AS, EPA:XXX -> XXX.PA, LON:XXX -> XXX.L, HKG:0001 -> 0001.HK
            if ":" in ticker:
                ex, sym = ticker.split(":", 1)
                ex = ex.upper()
                sym = sym.strip()
                if ex == "BME":
                    symbol = f"{sym}.MC"
                elif ex == "AMS":
                    symbol = f"{sym}.AS"
                elif ex == "EPA":
                    symbol = f"{sym}.PA"
                elif ex == "LON":
                    symbol = f"{sym}.L"
                elif ex == "HKG":
                    symbol = f"{sym}.HK"
                elif ex in ("NASDAQ", "NYSE", "NYSEARCA"):
                    symbol = sym
                else:
                    symbol = sym
            else:
                symbol = ticker

        # Pull company name + domain from Yahoo
        summary = yahoo_quote_summary(symbol)
        company_name = extract_company_name(summary) if summary else None
        domain = extract_website_domain(summary) if summary else None

        # Slug filename
        base_name = company_name or symbol or ticker
        file_slug = slugify(base_name, lowercase=True, separator="-")
        out_path = OUT_DIR / f"{file_slug}.png"

        # Skip if already exists
        if out_path.exists():
            manifest.append({
                "ticker": ticker,
                "symbol": symbol,
                "company_name": company_name,
                "domain": domain,
                "file": out_path.name,
                "logo_source": "cached"
            })
            continue

        logo_bytes, logo_src = download_logo(symbol, domain)
        if logo_bytes:
            out_path.write_bytes(logo_bytes)
            status = "ok"
        else:
            status = "missing"

        manifest.append({
            "ticker": ticker,
            "symbol": symbol,
            "company_name": company_name,
            "domain": domain,
            "file": out_path.name if status == "ok" else None,
            "logo_source": logo_src,
            "status": status
        })

        print(f"[{i}/{len(rows)}] {ticker} -> {company_name or symbol} | {status}")
        time.sleep(SLEEP_SECONDS)

    # Write manifest
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    # Build ZIP
    build_zip_from_dir(OUT_DIR, OUT_ZIP)
    print(f"\n✅ ZIP generado: {OUT_ZIP}")
    print(f"✅ Logos en: {OUT_DIR.resolve()}")
    print("ℹ️ Revisa logos/manifest.json para ver fallos o fuentes.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

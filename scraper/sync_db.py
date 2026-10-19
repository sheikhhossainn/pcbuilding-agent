import os
import sys
import time
import requests
import json
import re
import threading
import uuid
from pathlib import Path
from dotenv import load_dotenv

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import scrapers.startech as startech
import scrapers.techland as techland

try:
    import scrapers.computermania as computermania
except ImportError:
    computermania = None
    print("Warning: DrissionPage not installed — ComputerMania scraper disabled")

try:
    import scrapers.ryans as ryans
except ImportError:
    ryans = None
    print("Warning: DrissionPage or lxml not installed — Ryans scraper disabled")

# Load environment variables (from the backend folder)
env_path = Path(__file__).resolve().parent.parent / 'backend' / '.env'
load_dotenv(dotenv_path=env_path)

TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")
STATE_FILE = "sync_state.json"

if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
    print("Warning: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not found in .env")

def to_turso_arg(val):
    if val is None:
        return {"type": "null"}
    elif isinstance(val, bool):
        return {"type": "integer", "value": "1" if val else "0"}
    elif isinstance(val, int):
        return {"type": "integer", "value": str(val)}
    elif isinstance(val, float):
        return {"type": "float", "value": val}
    else:
        return {"type": "text", "value": str(val)}

def execute_turso(sql, params=None):
    if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
        return []
    url = TURSO_DATABASE_URL.replace("libsql://", "https://") + "/v2/pipeline"
    args = [to_turso_arg(p) for p in params] if params else []
    payload = {
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": args}},
            {"type": "close"}
        ]
    }
    headers = {
        "Authorization": f"Bearer {TURSO_AUTH_TOKEN}",
        "Content-Type": "application/json"
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    res = data["results"][0]
    if res.get("type") == "error":
        raise Exception(res["error"]["message"])
    result = res["response"]["result"]
    col_names = [c["name"] for c in result["cols"]]
    rows = []
    for r in result["rows"]:
        row_dict = {}
        for col_name, cell in zip(col_names, r):
            if cell["type"] == "null":
                row_dict[col_name] = None
            elif cell["type"] == "integer":
                row_dict[col_name] = int(cell["value"])
            elif cell["type"] == "float":
                row_dict[col_name] = float(cell["value"])
            else:
                row_dict[col_name] = cell["value"]
        rows.append(row_dict)
    return rows

def execute_turso_batch(stmts):
    """Executes a list of (sql, params) tuples against Turso in a single batch request."""
    if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN or not stmts:
        return
    url = TURSO_DATABASE_URL.replace("libsql://", "https://") + "/v2/pipeline"
    requests_list = []
    for sql, params in stmts:
        args = [to_turso_arg(p) for p in params] if params else []
        requests_list.append({"type": "execute", "stmt": {"sql": sql, "args": args}})
    requests_list.append({"type": "close"})
    headers = {
        "Authorization": f"Bearer {TURSO_AUTH_TOKEN}",
        "Content-Type": "application/json"
    }
    resp = requests.post(url, headers=headers, json={"requests": requests_list}, timeout=45)
    resp.raise_for_status()
    data = resp.json()
    for r in data.get("results", []):
        if r.get("type") == "error":
            print(f"Turso batch error: {r['error']}")

CATEGORIES = [
    "cpu", "motherboard", "ram", "storage", "gpu",
    "psu", "casing", "cpu-cooler", "monitor", "mouse", "keyboard", "ups"
]

COMPUTERMANIA_CATEGORIES = [
    "cpu", "motherboard", "ram", "storage", "gpu",
    "psu", "casing", "cpu-cooler", "monitor", "mouse", "keyboard"
]

RYANS_CATEGORIES = [
    "cpu", "motherboard", "ram", "storage", "gpu",
    "psu", "casing", "cpu-cooler", "monitor", "mouse", "keyboard", "ups"
]

# All sites with their scraper modules and category lists
SITES = [
    {"name": "startech", "module": startech, "categories": CATEGORIES},
    {"name": "techland", "module": techland, "categories": CATEGORIES},
]
if computermania:
    SITES.append({"name": "computermania", "module": computermania, "categories": COMPUTERMANIA_CATEGORIES})
if ryans:
    SITES.append({"name": "ryans", "module": ryans, "categories": RYANS_CATEGORIES})

state_lock = threading.Lock()

MIN_CATEGORY_PRICES = {
    "cpu": 1500,
    "motherboard": 2000,
    "gpu": 2500,
    "ram": 500,
    "storage": 500,
    "psu": 800,
    "casing": 800,
    "cpu-cooler": 350,
    "monitor": 3000,
    "ups": 1500,
    "keyboard": 100,
    "mouse": 80
}

def fresh_state():
    """Progress state with every site at its first category."""
    return {s["name"]: 0 for s in SITES}

def load_state():
    with state_lock:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, "r") as f:
                return json.load(f)
    return fresh_state()

def save_state(state):
    with state_lock:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f)

def infer_specs(category, name):
    specs = {}
    if not name:
        return specs
    n = name.lower()

    if category == 'cpu':
        if any(b in n for b in ['amd', 'ryzen', 'athlon', 'threadripper']):
            specs['brand'] = 'amd'
        elif any(b in n for b in ['intel', 'core i', 'pentium', 'celeron', 'ultra']):
            specs['brand'] = 'intel'
        else:
            specs['brand'] = 'unknown'

    if category in ['cpu', 'motherboard']:
        # AM5
        if any(s in n for s in ['am5', 'b650', 'x670', 'a620', 'x870', 'b850', 'b840']) or re.search(r'ryzen\s*[579]\s*(7|8|9)\d{3}', n):
            specs['socket'] = 'AM5'
            specs['ram_type'] = 'DDR5'
        # AM4 (all Ryzen desktop generations 1000 through 5000 + Athlon)
        elif any(s in n for s in ['am4', 'b450', 'b550', 'x570', 'a320', 'a520', 'x470', 'b350', 'x370']) or re.search(r'ryzen\s*[3579]\s*(1|2|3|4|5)\d{3}', n) or any(g in n for g in ['2400g', '2400ge', '3200g', '3400g', '4600g', '5600g', '5700g', '300ge', '200ge']):
            specs['socket'] = 'AM4'
            specs['ram_type'] = 'DDR4'
        # LGA1851 (Core Ultra Series 2)
        elif any(s in n for s in ['lga1851', 'lga 1851', 'z890', 'b860', 'h810', 'ultra 9', 'ultra 7', 'ultra 5']):
            specs['socket'] = 'LGA1851'
            specs['ram_type'] = 'DDR5'
        # LGA1700 (12th, 13th, 14th Gen Intel)
        elif any(s in n for s in ['lga1700', 'lga 1700', 'h610', 'b660', 'b760', 'z690', 'z790']) or re.search(r'1[234]\d{3}', n):
            specs['socket'] = 'LGA1700'
            specs['ram_type'] = 'DDR4' if 'ddr4' in n else ('DDR5' if 'ddr5' in n else 'UNKNOWN')
        # LGA1200 (10th, 11th Gen Intel)
        elif any(s in n for s in ['lga1200', 'lga 1200', 'h410', 'b460', 'h510', 'b560', 'z490', 'z590']) or re.search(r'1[01]\d{3}', n) or '10105' in n:
            specs['socket'] = 'LGA1200'
            specs['ram_type'] = 'DDR4'
        # LGA1151 (6th, 7th, 8th, 9th Gen Intel)
        elif any(s in n for s in ['lga1151', 'lga 1151', 'h110', 'b250', 'h310', 'b360', 'b365', 'z390']) or re.search(r'[6789]\d{3}', n):
            specs['socket'] = 'LGA1151'
            specs['ram_type'] = 'DDR4'
        # LGA1150 (4th Gen)
        elif any(s in n for s in ['lga1150', 'lga 1150', 'h81', 'b85', 'z97']):
            specs['socket'] = 'LGA1150'
            specs['ram_type'] = 'DDR3'
        # LGA1155 (2nd, 3rd Gen)
        elif any(s in n for s in ['lga1155', 'lga 1155', 'h61', 'b75', 'z77']):
            specs['socket'] = 'LGA1155'
            specs['ram_type'] = 'DDR3'
        else:
            specs['socket'] = 'UNKNOWN'
            specs['ram_type'] = 'DDR5' if 'ddr5' in n else ('DDR3' if 'ddr3' in n else ('DDR4' if 'ddr4' in n else 'UNKNOWN'))

    if category == 'cpu':
        if 'i9' in n or 'ryzen 9' in n or 'ultra 9' in n:
            specs['tdp'] = 125
        elif 'i7' in n or 'ryzen 7' in n or 'ultra 7' in n:
            specs['tdp'] = 105
        else:
            specs['tdp'] = 65

    if category == 'ram':
        if 'ddr5' in n: specs['ram_type'] = 'DDR5'
        elif 'ddr3' in n: specs['ram_type'] = 'DDR3'
        else: specs['ram_type'] = 'DDR4'

    if category == 'gpu':
        if any(k in n for k in ['nvidia', 'geforce', 'rtx', 'gtx']):
            specs['gpu_brand'] = 'nvidia'
        elif any(k in n for k in ['radeon', 'rx ']):
            specs['gpu_brand'] = 'amd'
        elif 'intel' in n or 'arc ' in n:
            specs['gpu_brand'] = 'intel'
        else:
            specs['gpu_brand'] = 'unknown'

        if '4090' in n or '5090' in n: specs['tdp'] = 450
        elif '4080' in n or '7900' in n or '5080' in n: specs['tdp'] = 320
        elif '4070' in n or '7800' in n or '5070' in n: specs['tdp'] = 220
        elif '4060' in n or '7600' in n: specs['tdp'] = 160
        elif '5060' in n: specs['tdp'] = 180
        elif '3060' in n: specs['tdp'] = 170
        elif '3050' in n: specs['tdp'] = 130
        elif '1650' in n or '1660' in n: specs['tdp'] = 100
        else: specs['tdp'] = 180

    if category == 'psu':
        match = re.search(r'(\d+)\s*(w\b|watt)', n)
        if match:
            specs['wattage'] = int(match.group(1))
        else:
            specs['wattage'] = 500

    return specs

def upsert_to_turso(data):
    if not TURSO_DATABASE_URL or not data:
        return
    stmts = []
    sql = """
    INSERT INTO components (id, site, category, name, price, image, url, in_stock, specs, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(url) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        image = excluded.image,
        in_stock = excluded.in_stock,
        specs = excluded.specs,
        last_updated = CURRENT_TIMESTAMP;
    """
    for p in data:
        part_id = str(uuid.uuid4())
        specs_json = json.dumps(p.get("specs", {}))
        in_stock_int = 1 if p.get("in_stock", True) else 0
        params = [
            part_id,
            p["site"],
            p["category"],
            p["name"],
            int(p["price"]),
            p.get("image"),
            p["url"],
            in_stock_int,
            specs_json
        ]
        stmts.append((sql, params))

    try:
        execute_turso_batch(stmts)
    except Exception as e:
        print(f"Failed to upsert to Turso: {e}")

def mark_stale_out_of_stock(site, category, scraped_urls):
    """Mark components in DB as out-of-stock if they weren't in the latest scrape."""
    if not TURSO_DATABASE_URL or not scraped_urls:
        return 0

    try:
        sql = "SELECT url FROM components WHERE site = ? AND category = ? AND in_stock = 1;"
        existing = execute_turso(sql, [site, category])
    except Exception as e:
        print(f"  Failed to fetch existing URLs for stale check: {e}")
        return 0

    existing_urls = {item['url'] for item in existing}
    stale_urls = existing_urls - scraped_urls

    if not stale_urls:
        return 0

    stmts = []
    patch_sql = "UPDATE components SET in_stock = 0 WHERE url = ?;"
    for stale_url in stale_urls:
        stmts.append((patch_sql, [stale_url]))

    try:
        execute_turso_batch(stmts)
    except Exception as e:
        print(f"  Failed to mark stale items in Turso: {e}")

    print(f"  Marked {len(stale_urls)} stale items as out-of-stock for {site}/{category}")
    return len(stale_urls)


def _scrape_site(site_info, state, log, progress, stop_event):
    """Scrape all categories for a single site. Returns True if fully completed.

    Scrapers that keep a browser open across categories expose close(); it runs however the
    site ends (finished, stop requested, or an error).
    """
    try:
        return _scrape_site_categories(site_info, state, log, progress, stop_event)
    finally:
        close = getattr(site_info["module"], "close", None)
        if callable(close):
            try:
                close()
            except Exception as e:
                log(f"  Failed to close {site_info['name']} scraper: {e}")


def _scrape_site_categories(site_info, state, log, progress, stop_event):
    site_name = site_info["name"]
    module = site_info["module"]
    categories = site_info["categories"]
    start_idx = state.get(site_name, 0)

    log(f"--- Scraping {site_name.capitalize()} ---")

    for i in range(start_idx, len(categories)):
        # Check for stop signal between categories
        if stop_event and stop_event.is_set():
            log(f"⏹ Stop requested. Pausing {site_name} at category index {i}.")
            return False

        category = categories[i]
        log(f"Syncing {site_name.capitalize()}: {category}...")
        progress({
            "site": site_name,
            "category": category,
            "category_index": i,
            "total_categories": len(categories),
            "status": "scraping",
        })

        try:
            products = module.scrape(category)
            batch = []
            scraped_urls = set()
            min_thresh = MIN_CATEGORY_PRICES.get(category, 50)
            for p in products:
                price = p.get('price')
                if not price or price < min_thresh:
                    continue
                scraped_urls.add(p['url'])
                batch.append({
                    "site": site_name,
                    "category": category,
                    "name": p['name'],
                    "price": price,
                    "image": p['image'],
                    "url": p['url'],
                    "in_stock": p.get('in_stock', True),
                    "specs": infer_specs(category, p['name'])
                })
            
            for j in range(0, len(batch), 50):
                upsert_to_turso(batch[j:j+50])
            
            in_stock_count = sum(1 for p in batch if p.get('in_stock', True))
            out_of_stock_count = len(batch) - in_stock_count
            log(f"  OK Upserted {len(batch)} items from {site_name.capitalize()} ({category}) — {in_stock_count} in stock, {out_of_stock_count} out of stock")

            # Mark items no longer on the website as out of stock
            stale_count = mark_stale_out_of_stock(site_name, category, scraped_urls)
            
            progress({
                "site": site_name,
                "category": category,
                "category_index": i + 1,
                "total_categories": len(categories),
                "status": "done_category",
                "items_upserted": len(batch),
                "in_stock": in_stock_count,
                "out_of_stock": out_of_stock_count,
                "stale_marked": stale_count,
            })

            # Save state after successful category scrape
            state[site_name] = i + 1
            save_state(state)
        except Exception as e:
            log(f"  Error scraping {site_name.capitalize()} for {category}: {e}")
            log(f"  Pausing sync to avoid bans. Will resume from this category next time.")
            progress({
                "site": site_name,
                "category": category,
                "category_index": i,
                "total_categories": len(categories),
                "status": "error",
                "error": str(e),
            })
            return False
            
        time.sleep(3)  # Politeness to prevent getting banned

    return True  # All categories completed


def run_sync(stop_event=None, log_callback=None, progress_callback=None, sites=None):
    """Run the full scraper sync.

    Args:
        stop_event: threading.Event — if set, scraper will stop after current category
        log_callback: Callable[[str], None] — receives log messages (replaces print)
        progress_callback: Callable[[dict], None] — receives structured progress updates
        sites: optional list of site names to sync. Only their state entries are read and reset;
            other sites' progress is left as it is. None means every site.
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        print(msg)

    def progress(data):
        if progress_callback:
            progress_callback(data)

    selected = SITES if sites is None else [s for s in SITES if s["name"] in sites]
    if not selected:
        log(f"No matching sites to sync: {sites}")
        return

    log("Starting sync...")
    state = load_state()

    def reset_selected():
        for s in selected:
            state[s["name"]] = 0
        save_state(state)

    active_sites = [s for s in selected if state.get(s["name"], 0) < len(s["categories"])]
    if not active_sites:
        log("All sites are already complete. Resetting state for fresh sync...")
        reset_selected()
        active_sites = selected

    log(f"Starting parallel sync for {len(active_sites)} site(s): {', '.join(s['name'].capitalize() for s in active_sites)}")

    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(active_sites)) as executor:
        futures = {executor.submit(_scrape_site, s, state, log, progress, stop_event): s["name"] for s in active_sites}
        for future in concurrent.futures.as_completed(futures):
            s_name = futures[future]
            try:
                res = future.result()
                if not res:
                    log(f"Site {s_name.capitalize()} paused or encountered an issue.")
            except Exception as e:
                log(f"Exception while scraping {s_name.capitalize()}: {e}")

    # Check if everything is done
    all_done = all(
        state.get(s["name"], 0) >= len(s["categories"]) for s in selected
    )
    if all_done:
        log("✓ Sync fully completed across all sites. Resetting state for next run.")
        reset_selected()
        progress({"status": "completed"})
    else:
        progress({"status": "stopped"})


def get_turso_stats():
    """Query Turso for component counts grouped by site, category, and stock status."""
    if not TURSO_DATABASE_URL:
        return []

    sql = """
    SELECT 
        site,
        category,
        count(*) as total,
        sum(CASE WHEN in_stock = 1 THEN 1 ELSE 0 END) as in_stock,
        sum(CASE WHEN in_stock = 0 THEN 1 ELSE 0 END) as out_of_stock
    FROM components
    GROUP BY site, category
    ORDER BY site, category;
    """
    try:
        rows = execute_turso(sql)
        for r in rows:
            r["in_stock"] = r.get("in_stock") or 0
            r["out_of_stock"] = r.get("out_of_stock") or 0
            r["total"] = r.get("total") or 0
        return rows
    except Exception as e:
        print(f"Failed to fetch stats from Turso: {e}")
        return []


def parse_sites_arg(value):
    """Turn 'ryans,startech' into a list of known site names; raises ValueError on an unknown one."""
    names = [n.strip().lower() for n in value.split(",") if n.strip()]
    known = {s["name"] for s in SITES}
    unknown = [n for n in names if n not in known]
    if unknown or not names:
        given = ", ".join(unknown) if unknown else repr(value)
        raise ValueError(f"Unknown site(s): {given}. Choose from: {', '.join(sorted(known))}")
    return names


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Scrape retailer sites into Turso.")
    parser.add_argument("--sites", help="Comma-separated sites to sync (default: all), e.g. --sites ryans")
    args = parser.parse_args()
    try:
        selected_sites = parse_sites_arg(args.sites) if args.sites else None
    except ValueError as e:
        parser.error(str(e))
    run_sync(sites=selected_sites)

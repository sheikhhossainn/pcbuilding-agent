import os
import time
import requests
import json
import re
import threading
from pathlib import Path
from dotenv import load_dotenv

import scrapers.startech as startech
import scrapers.techland as techland

try:
    import scrapers.computermania as computermania
except ImportError:
    computermania = None
    print("Warning: DrissionPage not installed — ComputerMania scraper disabled")

# Load environment variables (from the backend folder)
env_path = Path(__file__).resolve().parent.parent / 'backend' / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
STATE_FILE = "sync_state.json"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=ignore-duplicates"
}

CATEGORIES = [
    "cpu", "motherboard", "ram", "storage", "gpu",
    "psu", "casing", "cpu-cooler", "monitor", "mouse", "keyboard", "ups"
]

COMPUTERMANIA_CATEGORIES = [
    "cpu", "motherboard", "ram", "storage", "gpu",
    "psu", "casing", "cpu-cooler", "monitor", "mouse", "keyboard"
]

# All sites with their scraper modules and category lists
SITES = [
    {"name": "startech", "module": startech, "categories": CATEGORIES},
    {"name": "techland", "module": techland, "categories": CATEGORIES},
]
if computermania:
    SITES.append({"name": "computermania", "module": computermania, "categories": COMPUTERMANIA_CATEGORIES})

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {"startech": 0, "techland": 0, "computermania": 0}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)

def infer_specs(category, name):
    specs = {}
    n = name.lower()
    
    # Mappings from JS inferSpecs
    if category == 'cpu':
        if 'amd' in n or 'ryzen' in n or 'athlon' in n or 'threadripper' in n:
            specs['brand'] = 'amd'
        elif 'intel' in n or 'core i' in n or 'pentium' in n or 'celeron' in n:
            specs['brand'] = 'intel'
        else:
            specs['brand'] = 'unknown'

    if category in ['cpu', 'motherboard']:
        if 'am5' in n or 'b650' in n or 'x670' in n or 'a620' in n or 'x870' in n or re.search(r'ryzen [579] (7|8|9)\d{3}', n):
            specs['socket'] = 'AM5'
            specs['ram_type'] = 'DDR5'
        elif 'am4' in n or 'b450' in n or 'b550' in n or 'x570' in n or 'a320' in n or 'a520' in n or re.search(r'ryzen [3579] (3|4|5)\d{3}', n) or '4600g' in n or '5600g' in n or '5700g' in n:
            specs['socket'] = 'AM4'
            specs['ram_type'] = 'DDR4'
        elif 'lga1700' in n or 'lga 1700' in n or 'h610' in n or 'b660' in n or 'b760' in n or 'z690' in n or 'z790' in n or re.search(r'1[234][14679]00', n):
            specs['socket'] = 'LGA1700'
            specs['ram_type'] = 'DDR4' if 'ddr4' in n else ('DDR5' if 'ddr5' in n else 'UNKNOWN')
        elif 'lga1200' in n or 'lga 1200' in n or 'h410' in n or 'b460' in n or 'h510' in n or 'b560' in n or 'z490' in n or 'z590' in n or re.search(r'1[01][1479]00', n) or '10105' in n:
            specs['socket'] = 'LGA1200'
            specs['ram_type'] = 'DDR4'
        elif 'lga1151' in n or 'lga 1151' in n or 'h310' in n or 'b360' in n or 'b365' in n or 'z390' in n or re.search(r'[89][1479]00', n):
            specs['socket'] = 'LGA1151'
            specs['ram_type'] = 'DDR4'
        else:
            specs['socket'] = 'UNKNOWN'
            specs['ram_type'] = 'DDR5' if 'ddr5' in n else ('DDR3' if 'ddr3' in n else 'UNKNOWN')

    if category == 'cpu':
        if 'i9' in n or 'ryzen 9' in n: specs['tdp'] = 125
        elif 'i7' in n or 'ryzen 7' in n: specs['tdp'] = 105
        else: specs['tdp'] = 65

    if category == 'ram':
        if 'ddr5' in n: specs['ram_type'] = 'DDR5'
        elif 'ddr3' in n: specs['ram_type'] = 'DDR3'
        else: specs['ram_type'] = 'DDR4'

    if category == 'gpu':
        if 'nvidia' in n or 'geforce' in n or 'rtx' in n or 'gtx' in n:
            specs['gpu_brand'] = 'nvidia'
        elif 'radeon' in n or 'rx ' in n:
            specs['gpu_brand'] = 'amd'
        else:
            specs['gpu_brand'] = 'unknown'

        if '4090' in n or '5090' in n: specs['tdp'] = 450
        elif '4080' in n or '7900' in n or '5080' in n: specs['tdp'] = 320
        elif '4070' in n or '7800' in n or '5070' in n: specs['tdp'] = 220
        elif '4060' in n or '7600' in n: specs['tdp'] = 160
        elif '5060' in n: specs['tdp'] = 180
        else: specs['tdp'] = 180

    if category == 'psu':
        match = re.search(r'(\d+)\s*(w\b|watt)', n)
        if match:
            specs['wattage'] = int(match.group(1))
        else:
            specs['wattage'] = 500

    return specs

def upsert_to_supabase(data):
    if not SUPABASE_URL: return
    # Use the upsert API with on_conflict
    url = f"{SUPABASE_URL}/rest/v1/components?on_conflict=url"
    headers = HEADERS.copy()
    headers["Prefer"] = "resolution=merge-duplicates"
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
    except Exception as e:
        print(f"Failed to upsert to Supabase: {e}")

def mark_stale_out_of_stock(site, category, scraped_urls):
    """Mark components in DB as out-of-stock if they weren't in the latest scrape."""
    if not SUPABASE_URL or not scraped_urls:
        return 0

    # Fetch all existing URLs for this site+category
    url = f"{SUPABASE_URL}/rest/v1/components?site=eq.{site}&category=eq.{category}&in_stock=eq.true&select=url"
    try:
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        existing = response.json()
    except Exception as e:
        print(f"  Failed to fetch existing URLs for stale check: {e}")
        return 0

    existing_urls = {item['url'] for item in existing}
    stale_urls = existing_urls - scraped_urls

    if not stale_urls:
        return 0

    # Mark stale items as out of stock
    for stale_url in stale_urls:
        patch_url = f"{SUPABASE_URL}/rest/v1/components?url=eq.{requests.utils.quote(stale_url, safe='')}"
        try:
            requests.patch(patch_url, headers=HEADERS, json={"in_stock": False})
        except Exception:
            pass

    print(f"  Marked {len(stale_urls)} stale items as out-of-stock for {site}/{category}")
    return len(stale_urls)


def _scrape_site(site_info, state, log, progress, stop_event):
    """Scrape all categories for a single site. Returns True if fully completed."""
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
            for p in products:
                if not p.get('price'): continue
                scraped_urls.add(p['url'])
                batch.append({
                    "site": site_name,
                    "category": category,
                    "name": p['name'],
                    "price": p['price'],
                    "image": p['image'],
                    "url": p['url'],
                    "in_stock": p.get('in_stock', True),
                    "specs": infer_specs(category, p['name'])
                })
            
            for j in range(0, len(batch), 50):
                upsert_to_supabase(batch[j:j+50])
            
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


def run_sync(stop_event=None, log_callback=None, progress_callback=None):
    """Run the full scraper sync.
    
    Args:
        stop_event: threading.Event — if set, scraper will stop after current category
        log_callback: Callable[[str], None] — receives log messages (replaces print)
        progress_callback: Callable[[dict], None] — receives structured progress updates
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        print(msg)

    def progress(data):
        if progress_callback:
            progress_callback(data)

    log("Starting sync...")
    state = load_state()

    # Calculate total categories across all sites for overall progress
    total_all = sum(len(s["categories"]) for s in SITES)
    completed_before = sum(state.get(s["name"], 0) for s in SITES)

    for site_info in SITES:
        site_name = site_info["name"]
        # Skip sites that are already fully complete
        if state.get(site_name, 0) >= len(site_info["categories"]):
            continue

        # Check previous sites are complete before starting this one
        site_idx = SITES.index(site_info)
        if site_idx > 0:
            prev_site = SITES[site_idx - 1]
            if state.get(prev_site["name"], 0) < len(prev_site["categories"]):
                log(f"Skipping {site_name} — previous site not complete yet.")
                break

        completed = _scrape_site(site_info, state, log, progress, stop_event)
        if not completed:
            # Either stopped or errored — exit
            progress({"status": "stopped"})
            return

    # Check if everything is done
    all_done = all(
        state.get(s["name"], 0) >= len(s["categories"]) for s in SITES
    )
    if all_done:
        log("✓ Sync fully completed. Resetting state for next run.")
        save_state({"startech": 0, "techland": 0, "computermania": 0})
        progress({"status": "completed"})
    else:
        progress({"status": "stopped"})


def get_supabase_stats():
    """Query Supabase for component counts grouped by site, category, and stock status."""
    if not SUPABASE_URL:
        return []
    
    # Fetch all components with pagination to bypass the 1000 row limit
    rows = []
    limit = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/components?select=site,category,in_stock&limit={limit}&offset={offset}"
        try:
            response = requests.get(url, headers=HEADERS)
            response.raise_for_status()
            batch = response.json()
            rows.extend(batch)
            if len(batch) < limit:
                break
            offset += limit
        except Exception as e:
            print(f"Failed to fetch stats: {e}")
            break

    # Aggregate in Python
    counts = {}
    for row in rows:
        key = (row["site"], row["category"])
        if key not in counts:
            counts[key] = {"site": row["site"], "category": row["category"], "in_stock": 0, "out_of_stock": 0, "total": 0}
        counts[key]["total"] += 1
        if row.get("in_stock"):
            counts[key]["in_stock"] += 1
        else:
            counts[key]["out_of_stock"] += 1

    return sorted(counts.values(), key=lambda x: (x["site"], x["category"]))


if __name__ == "__main__":
    run_sync()

import os
import time
import requests
import json
import re
from pathlib import Path
from dotenv import load_dotenv

import scrapers.startech as startech
import scrapers.techland as techland

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

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {"startech": 0, "techland": 0}

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

def run_sync():
    print("Starting sync...")
    state = load_state()
    
    # 1. StarTech
    print("--- Scraping Startech ---")
    start_idx = state["startech"]
    for i in range(start_idx, len(CATEGORIES)):
        category = CATEGORIES[i]
        print(f"Syncing Startech: {category}...")
        try:
            startech_products = startech.scrape(category)
            batch = []
            for p in startech_products:
                if not p.get('price'): continue
                if not p.get('in_stock', True): continue
                batch.append({
                    "site": "startech",
                    "category": category,
                    "name": p['name'],
                    "price": p['price'],
                    "image": p['image'],
                    "url": p['url'],
                    "in_stock": p['in_stock'],
                    "specs": infer_specs(category, p['name'])
                })
            
            for j in range(0, len(batch), 50):
                upsert_to_supabase(batch[j:j+50])
            print(f"  Upserted {len(batch)} items from StarTech ({category}).")
            
            # Save state after successful category scrape
            state["startech"] = i + 1
            save_state(state)
        except Exception as e:
            print(f"  Error scraping StarTech for {category}: {e}")
            print("  Pausing sync to avoid bans. Will resume from this category next time.")
            return # Stop completely to avoid hitting techland right away
            
        time.sleep(3) # Politeness to prevent getting banned
        
    # Only move to TechLand if StarTech is 100% complete
    if state["startech"] < len(CATEGORIES):
        return

    # 2. TechLand
    print("--- Scraping TechLand ---")
    start_idx = state["techland"]
    for i in range(start_idx, len(CATEGORIES)):
        category = CATEGORIES[i]
        print(f"Syncing TechLand: {category}...")
        try:
            techland_products = techland.scrape(category)
            batch = []
            for p in techland_products:
                if not p.get('price'): continue
                if not p.get('in_stock', True): continue
                batch.append({
                    "site": "techland",
                    "category": category,
                    "name": p['name'],
                    "price": p['price'],
                    "image": p['image'],
                    "url": p['url'],
                    "in_stock": p['in_stock'],
                    "specs": infer_specs(category, p['name'])
                })
            
            for j in range(0, len(batch), 50):
                upsert_to_supabase(batch[j:j+50])
            print(f"  Upserted {len(batch)} items from Techland ({category}).")
            
            # Save state after successful category scrape
            state["techland"] = i + 1
            save_state(state)
        except Exception as e:
            print(f"  Error scraping Techland for {category}: {e}")
            print("  Pausing sync to avoid bans. Will resume from this category next time.")
            break
            
        time.sleep(3) # Politeness to prevent getting banned
        
    # Reset completion state if everything finished
    if state["startech"] == len(CATEGORIES) and state["techland"] == len(CATEGORIES):
        print("Sync fully completed. Resetting state.")
        save_state({"startech": 0, "techland": 0})

if __name__ == "__main__":
    run_sync()

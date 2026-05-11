from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from collections import OrderedDict
import importlib
import time

# In-memory cache: key -> { "data": [...], "timestamp": float }
# NOTE: bounded to avoid unbounded growth on long-running instances.
_cache = OrderedDict()
CACHE_TTL = 30 * 60  # 30 minutes
MAX_CACHE_SIZE = 50  # max number of cached queries


def set_cache(key: str, data):
    # If key exists, refresh its insertion order.
    if key in _cache:
        del _cache[key]
    elif len(_cache) >= MAX_CACHE_SIZE:
        # Remove oldest entry
        _cache.popitem(last=False)
    _cache[key] = {"data": data, "timestamp": time.time()}

app = FastAPI(title="BuildMyPC Scraper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_CATEGORIES = [
    "cpu", "motherboard", "ram", "storage", "gpu",
    "psu", "casing", "cpu-cooler", "monitor", "mouse", "keyboard"
]

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "BuildMyPC Scraper API",
        "docs": "/docs",
        "health": "/health",
        "scrape": "/scrape"
    }

@app.get("/scrape")
async def scrape_products(
    site: str = Query(..., description="Site key (e.g. startech, techland) or a full URL for custom shops"),
    category: str = Query(..., description="The product category"),
    in_stock_only: bool = Query(True, description="Return only in-stock items"),
    price_min: Optional[int] = Query(None, description="Minimum price filter"),
    price_max: Optional[int] = Query(None, description="Maximum price filter"),
    sort: Optional[str] = Query(None, description="Sort order: price_asc or price_desc")
):
    site = site.strip()
    category = category.lower().strip()

    if category not in SUPPORTED_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unsupported category. Supported: {', '.join(SUPPORTED_CATEGORIES)}")

    # Route to generic scraper when a full URL is provided
    is_custom_url = site.startswith("http://") or site.startswith("https://")
    module_name = "generic" if is_custom_url else site.lower()

    try:
        scraper_module = importlib.import_module(f"scrapers.{module_name}")
    except ModuleNotFoundError as e:
        # If the missing module is the scraper module itself, treat it as an unsupported site (400).
        # Otherwise it's a missing dependency inside that scraper (should be 500).
        if e.name == f"scrapers.{module_name}":
            raise HTTPException(status_code=400, detail=f"Unsupported site: {site}")
        raise HTTPException(
            status_code=500,
            detail=(
                f"Scraper module '{module_name}' failed to import due to missing dependency: {e.name}. "
                "Check Render build logs / requirements.txt."
            ),
        )
    except ImportError as e:
        # ImportError can also be raised by nested imports inside the scraper module.
        raise HTTPException(
            status_code=500,
            detail=(
                f"Scraper module '{module_name}' failed to import: {type(e).__name__}: {str(e)}. "
                "Check Render build logs / requirements.txt."
            ),
        )

    if not hasattr(scraper_module, "scrape"):
        raise HTTPException(status_code=500, detail=f"Scraper for '{module_name}' is missing the scrape() function")

    try:
        cache_key = f"{module_name}:{category}:{price_min or 0}-{price_max or 0}:{sort or 'none'}"
        now = time.time()
        
        # Check cache first
        if cache_key in _cache and (now - _cache[cache_key]["timestamp"]) < CACHE_TTL:
            products = _cache[cache_key]["data"]
        else:
            if is_custom_url:
                products = scraper_module.scrape(category, site)
            else:
                products = scraper_module.scrape(
                    category,
                    price_min=price_min,
                    price_max=price_max,
                    sort_order=sort
                )
            set_cache(cache_key, products)
        
        if in_stock_only:
            products = [p for p in products if p["in_stock"]]
        return {"site": site, "category": category, "products": products, "count": len(products)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Scraping failed for {site}/{category}: {str(e)}")

@app.get("/health")
def health_check():
    return {"status": "ok"}

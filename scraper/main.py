from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import importlib
import time

# In-memory cache: key = "site:category" -> { "data": [...], "timestamp": float }
_cache = {}
CACHE_TTL = 30 * 60  # 30 minutes

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
    except ImportError:
        raise HTTPException(status_code=400, detail=f"Unsupported site: {site}")

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
            _cache[cache_key] = {"data": products, "timestamp": now}
        
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

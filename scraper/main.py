from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import importlib

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
    in_stock_only: bool = Query(True, description="Return only in-stock items")
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
        products = scraper_module.scrape(category, site) if is_custom_url else scraper_module.scrape(category)
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

from scrapling import Fetcher
import re

def scrape(category: str, base_url: str):
    fetcher = Fetcher()
    page = fetcher.get(base_url)
    
    products = []
    
    # Generic highly optimistic parsing for common e-commerce structures
    items = page.css(".product") or page.css(".item") or page.css("article") or page.css(".p-item") or page.css(".product-thumb")
    
    for item in items:
        try:
            # Generic name
            name_elem = item.css("h2") or item.css("h3") or item.css(".name") or item.css(".title") or item.css("a[title]")
            if not name_elem:
                continue
                
            name = name_elem[0].text.strip()
            if not name:
                name = name_elem[0].attrib.get("title", "").strip()
            
            if not name:
                continue
                 
            # Generic url
            link_elem = item.css("a")
            url = link_elem[0].attrib.get("href", "") if link_elem else base_url
            if url and not url.startswith("http"):
                # Basic absolute url conversion
                domain = '/'.join(base_url.split('/')[:3])
                if url.startswith("/"):
                     url = domain + url
                else:
                     url = domain + "/" + url

            # Generic price
            price_text = ""
            price_elem = item.css(".price") or item.css(".amount") or item.css("span[class*='price']")
            if price_elem:
                 price_text = price_elem[0].text.strip()
                 
            digits = re.sub(r'[^\d]', '', price_text)
            price = int(digits) if digits else None
            
            products.append({
                "name": name,
                "price": price,
                "image": None,
                "url": url,
                "in_stock": True
            })
        except Exception:
            continue
            
    return products

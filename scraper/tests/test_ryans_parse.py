import unittest
import sys
from pathlib import Path
from urllib.parse import urlsplit

SCRAPER_DIR = Path(__file__).resolve().parent.parent
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

from scrapers.ryans import parse_listing, last_page, URL_MAP

FIXTURES_DIR = SCRAPER_DIR / "tests" / "fixtures" / "ryans"


class TestRyansParse(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FIXTURES_DIR / "cpu_page1.html", "r", encoding="utf-8") as f:
            cls.cpu_html = f.read()
        with open(FIXTURES_DIR / "keyboard_page1.html", "r", encoding="utf-8") as f:
            cls.keyboard_html = f.read()
        with open(FIXTURES_DIR / "casing_page1.html", "r", encoding="utf-8") as f:
            cls.casing_html = f.read()
        with open(FIXTURES_DIR / "ups_page2.html", "r", encoding="utf-8") as f:
            cls.ups_html = f.read()

    def test_cpu_page1(self):
        """CPU page 1: 20 items, all in_stock, first item price == 4900, name starts with AMD Ryzen 3 2200G, last_page == 16."""
        self.assertEqual(last_page(self.cpu_html), 16)

        products = parse_listing(self.cpu_html)
        self.assertEqual(len(products), 20)

        # All items on this page are in stock
        for p in products:
            self.assertTrue(p["in_stock"], f"Item {p['name']} should be in stock")
            self.assertIsNotNone(p["price"])
            self.assertGreater(p["price"], 0)

        first = products[0]
        self.assertEqual(first["price"], 4900)
        self.assertTrue(
            first["name"].startswith("AMD Ryzen 3 2200G"),
            f"Expected name to start with 'AMD Ryzen 3 2200G', got '{first['name']}'"
        )

    def test_keyboard_page1_mixed_status_codes(self):
        """Keyboard page 1: code-5 and code-7 items are out of stock with price None; code-3 item is in stock with price."""
        products = parse_listing(self.keyboard_html)
        self.assertEqual(len(products), 20)

        # Item 18 (code 7) and Item 19 (code 5)
        code_7_items = [p for p in products if p.get("status_code") == "7"]
        code_5_items = [p for p in products if p.get("status_code") == "5"]
        code_3_items = [p for p in products if p.get("status_code") == "3"]

        self.assertTrue(len(code_7_items) >= 1)
        self.assertTrue(len(code_5_items) >= 1)
        self.assertTrue(len(code_3_items) >= 1)

        # Code 7: Coming Soon
        for p in code_7_items:
            self.assertFalse(p["in_stock"])
            self.assertIsNone(p["price"])

        # Code 5: Out of stock
        for p in code_5_items:
            self.assertFalse(p["in_stock"])
            self.assertIsNone(p["price"])

        # Code 3: Buyable item with price
        for p in code_3_items:
            self.assertTrue(p["in_stock"])
            self.assertIsNotNone(p["price"])
            self.assertGreater(p["price"], 0)

    def test_casing_special_discount(self):
        """Casing: a special_discount item's price == product_price2 (1500, not 1400 and not 1630)."""
        products = parse_listing(self.casing_html)
        self.assertEqual(len(products), 20)

        # Find Safeway MTG N18 (price1: 1630, price2: 1500, discount: 100)
        safeway = next((p for p in products if "MTG N18" in p["name"]), None)
        self.assertIsNotNone(safeway, "Safeway MTG N18 not found in casing products")
        self.assertEqual(safeway["price"], 1500)
        self.assertTrue(safeway["in_stock"])

    def test_ups_page2_empty(self):
        """UPS page 2: 0 cards and last_page == 1."""
        self.assertEqual(last_page(self.ups_html), 1)
        products = parse_listing(self.ups_html)
        self.assertEqual(products, [])

    def test_url_clean_and_stable(self):
        """Every product URL starts with https://www.ryans.com/ and has no query string or tracking."""
        for html_content in [self.cpu_html, self.keyboard_html, self.casing_html]:
            products = parse_listing(html_content)
            for p in products:
                url = p["url"]
                self.assertTrue(url.startswith("https://www.ryans.com/"), f"URL {url} must start with https://www.ryans.com/")
                split = urlsplit(url)
                self.assertEqual(split.query, "", f"URL {url} must not contain query parameters")
                self.assertEqual(split.fragment, "", f"URL {url} must not contain fragment")


if __name__ == "__main__":
    unittest.main()

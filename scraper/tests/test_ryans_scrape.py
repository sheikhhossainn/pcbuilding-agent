import unittest
from unittest.mock import patch
import sys
from pathlib import Path

SCRAPER_DIR = Path(__file__).resolve().parent.parent
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

import scrapers.ryans as ryans

FIXTURES_DIR = SCRAPER_DIR / "tests" / "fixtures" / "ryans"


class MockPage:
    def __init__(self, title, html_content):
        self.title = title
        self.html = html_content


class MockBrowser:
    def __init__(self, routes):
        # routes: dict[url_pattern_or_exact, tuple(bool cleared, str title, str html)]
        self.routes = routes
        self.opened_urls = []
        self._current_page = None
        self.closed = False

    @property
    def page(self):
        return self._current_page

    def is_cloudflare_cleared(self):
        if self._current_page is None:
            return False
        title = (self._current_page.title or "").lower()
        return "just a moment" not in title and "verification" not in title

    def open(self, url, timeout=300):
        self.opened_urls.append(url)
        if url in self.routes:
            cleared, title, html_content = self.routes[url]
        else:
            # Fallback for unmatched URLs
            cleared, title, html_content = (True, "Ryans Computers", "<html><body></body></html>")

        self._current_page = MockPage(title, html_content)
        return cleared

    def close(self):
        self.closed = True
        self._current_page = None


class SequenceBrowser(MockBrowser):
    """MockBrowser whose route values may be lists: each open() of that URL takes the next entry.

    An entry is (cleared, title, html), or an exception instance to raise from open().
    """

    def open(self, url, timeout=300):
        route = self.routes.get(url)
        if not isinstance(route, list):
            return super().open(url, timeout)
        self.opened_urls.append(url)
        entry = route.pop(0)
        if isinstance(entry, Exception):
            raise entry
        cleared, title, html_content = entry
        self._current_page = MockPage(title, html_content)
        return cleared


CPU_URL = "https://www.ryans.com/category/desktop-component-processor?limit=100"
CHALLENGE = (False, "Just a moment...", "<html><body>Challenge</body></html>")


def _card(slug, price):
    return (
        '<div class="category-single-product">'
        f'<div class="image-box"><a href="https://www.ryans.com/{slug}"><img src="{slug}.jpg"></a></div>'
        f'<button data-item=\'{{"product_name": "{slug}", "product_price2": {price}, "product_is_upcoming": "0"}}\'>Add to Cart</button>'
        '</div>'
    )


def _page(cards, last=None):
    pagination = ""
    if last:
        pagination = '<ul class="pagination">' + "".join(
            f'<a href="?page={n}">{n}</a>' for n in range(2, last + 1)
        ) + "</ul>"
    return f"<html><body>{''.join(cards)}{pagination}</body></html>"


class TestRyansScrape(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FIXTURES_DIR / "cpu_page1.html", "r", encoding="utf-8") as f:
            cls.cpu_html = f.read()
        with open(FIXTURES_DIR / "keyboard_page1.html", "r", encoding="utf-8") as f:
            cls.keyboard_html = f.read()
        with open(FIXTURES_DIR / "casing_page1.html", "r", encoding="utf-8") as f:
            cls.casing_html = f.read()
        with open(FIXTURES_DIR / "ups_page2.html", "r", encoding="utf-8") as f:
            cls.ups_empty_html = f.read()

    def tearDown(self):
        ryans.close()

    def test_unknown_category_raises_value_error(self):
        """scrape() raises ValueError for any unmapped category."""
        with self.assertRaises(ValueError):
            ryans.scrape("non_existent_category")

    @patch("time.sleep")
    def test_early_stop_on_all_out_of_stock_page(self, _mock_sleep):
        """scrape() stops pagination early when a page has only out-of-stock items, returning what was seen."""
        # Page 1: has 2 pages in pagination, returns in-stock items
        # Inject pagination with page=2 into cpu HTML
        page1_html = self.cpu_html.replace(
            "</ul>",
            '<li class="page-item"><a class="page-link" href="https://www.ryans.com/category/desktop-component-processor?limit=100&page=2">2</a></li>'
            '<li class="page-item"><a class="page-link" href="https://www.ryans.com/category/desktop-component-processor?limit=100&page=3">3</a></li></ul>'
        )

        # Page 2: only out-of-stock items (create cards with no price / out of stock)
        page2_html = (
            '<html><body>'
            '<div class="category-single-product">'
            '<div class="image-box"><a href="https://www.ryans.com/item-oos-1"><img src="img1.jpg"></a></div>'
            '<button data-item=\'{"product_name": "OOS 1", "product_price2": 0, "product_is_upcoming": "5"}\'>Details</button>'
            '</div>'
            '<div class="category-single-product">'
            '<div class="image-box"><a href="https://www.ryans.com/item-oos-2"><img src="img2.jpg"></a></div>'
            '<button data-item=\'{"product_name": "OOS 2", "product_price2": 0, "product_is_upcoming": "7"}\'>Coming Soon</button>'
            '</div>'
            '<ul class="pagination"><a href="?page=3">3</a></ul>'
            '</body></html>'
        )

        # Page 3 should never be called
        routes = {
            "https://www.ryans.com/category/desktop-component-processor?limit=100": (True, "Processors", page1_html),
            "https://www.ryans.com/category/desktop-component-processor?limit=100&page=2": (True, "Processors", page2_html),
            "https://www.ryans.com/category/desktop-component-processor?limit=100&page=3": (True, "Processors", "<html></html>"),
        }

        mock_browser = MockBrowser(routes)
        with patch.object(ryans, "_get_browser", return_value=mock_browser):
            results = ryans.scrape("cpu")

        # Page 3 was never visited
        self.assertIn("https://www.ryans.com/category/desktop-component-processor?limit=100", mock_browser.opened_urls)
        self.assertIn("https://www.ryans.com/category/desktop-component-processor?limit=100&page=2", mock_browser.opened_urls)
        self.assertNotIn("https://www.ryans.com/category/desktop-component-processor?limit=100&page=3", mock_browser.opened_urls)

        # Results include page 1 in-stock items + page 2 out-of-stock items
        self.assertEqual(len(results), 22)
        # Verify status_code was stripped
        for p in results:
            self.assertNotIn("status_code", p)

    @patch("time.sleep")
    def test_dedup_across_pages(self, _mock_sleep):
        """scrape() de-duplicates items with identical URLs across pages, keeping the first."""
        # Both page 1 and page 2 contain an item with URL https://www.ryans.com/duplicate-item
        dup_card = (
            '<div class="category-single-product">'
            '<div class="image-box"><a href="https://www.ryans.com/duplicate-item"><img src="dup.jpg"></a></div>'
            '<button data-item=\'{"product_name": "Dup Item", "product_price2": 2500, "product_is_upcoming": "0"}\'>Add to Cart</button>'
            '</div>'
        )
        p1 = f'<html><body>{dup_card}<ul class="pagination"><a href="?page=2">2</a></ul></body></html>'
        p2 = f'<html><body>{dup_card}</body></html>'

        routes = {
            "https://www.ryans.com/category/desktop-component-processor?limit=100": (True, "Processors", p1),
            "https://www.ryans.com/category/desktop-component-processor?limit=100&page=2": (True, "Processors", p2),
        }

        mock_browser = MockBrowser(routes)
        with patch.object(ryans, "_get_browser", return_value=mock_browser):
            results = ryans.scrape("cpu")

        # Dup item appears only once
        dup_items = [p for p in results if p["url"] == "https://www.ryans.com/duplicate-item"]
        self.assertEqual(len(dup_items), 1)

    def _three_page_routes(self, page2):
        """CPU routes where page 1 says there are 3 pages; page2 is the route value for page 2."""
        return {
            CPU_URL: (True, "Processors", _page([_card("item-1", 1000)], last=3)),
            CPU_URL + "&page=2": page2,
            CPU_URL + "&page=3": (True, "Processors", _page([_card("item-3", 3000)])),
        }

    @patch("time.sleep")
    def test_page_retried_once_then_succeeds(self, _mock_sleep):
        """A page that fails once and loads on the retry is kept: every page's items come back."""
        routes = self._three_page_routes([
            CHALLENGE,
            (True, "Processors", _page([_card("item-2", 2000)])),
        ])
        mock_browser = SequenceBrowser(routes)
        with patch.object(ryans, "_get_browser", return_value=mock_browser):
            results = ryans.scrape("cpu")

        self.assertEqual(mock_browser.opened_urls.count(CPU_URL + "&page=2"), 2)
        self.assertEqual(
            [p["url"] for p in results],
            ["https://www.ryans.com/item-1", "https://www.ryans.com/item-2", "https://www.ryans.com/item-3"],
        )

    @patch("time.sleep")
    def test_page_failing_twice_raises(self, _mock_sleep):
        """A page whose challenge never clears raises instead of returning the other pages' items."""
        mock_browser = SequenceBrowser(self._three_page_routes([CHALLENGE, CHALLENGE]))
        with patch.object(ryans, "_get_browser", return_value=mock_browser):
            with self.assertRaises(RuntimeError) as ctx:
                ryans.scrape("cpu")

        self.assertIn("page 2", str(ctx.exception))
        self.assertNotIn(CPU_URL + "&page=3", mock_browser.opened_urls)

    @patch("time.sleep")
    def test_open_raising_twice_raises(self, _mock_sleep):
        """An exception from the browser on both tries raises RuntimeError."""
        error = RuntimeError("tab crashed")
        mock_browser = SequenceBrowser(self._three_page_routes([error, error]))
        with patch.object(ryans, "_get_browser", return_value=mock_browser):
            with self.assertRaises(RuntimeError) as ctx:
                ryans.scrape("cpu")

        self.assertIn("tab crashed", str(ctx.exception))

    @patch("time.sleep")
    def test_empty_first_page_raises(self, _mock_sleep):
        """Page 1 loading with a normal title but no products means a wrong URL or changed markup."""
        routes = {CPU_URL: (True, "Page Not Found | RYANS", "<html><body><p>Nothing here</p></body></html>")}
        mock_browser = MockBrowser(routes)
        with patch.object(ryans, "_get_browser", return_value=mock_browser):
            with self.assertRaises(RuntimeError) as ctx:
                ryans.scrape("cpu")

        self.assertIn("0 items on page 1", str(ctx.exception))

    @patch("time.sleep")
    def test_storage_walks_both_urls(self, _mock_sleep):
        """scrape('storage') walks both internal-ssd and internal-hdd endpoints."""
        ssd_page = (
            '<html><body>'
            '<div class="category-single-product">'
            '<div class="image-box"><a href="https://www.ryans.com/ssd-1"><img src="ssd.jpg"></a></div>'
            '<button data-item=\'{"product_name": "SSD 1", "product_price2": 4000, "product_is_upcoming": "0"}\'>Add to Cart</button>'
            '</div>'
            '</body></html>'
        )
        hdd_page = (
            '<html><body>'
            '<div class="category-single-product">'
            '<div class="image-box"><a href="https://www.ryans.com/hdd-1"><img src="hdd.jpg"></a></div>'
            '<button data-item=\'{"product_name": "HDD 1", "product_price2": 5000, "product_is_upcoming": "0"}\'>Add to Cart</button>'
            '</div>'
            '</body></html>'
        )

        routes = {
            "https://www.ryans.com/category/internal-ssd?limit=100": (True, "Internal SSD", ssd_page),
            "https://www.ryans.com/category/internal-hdd?limit=100": (True, "Internal HDD", hdd_page),
        }

        mock_browser = MockBrowser(routes)
        with patch.object(ryans, "_get_browser", return_value=mock_browser):
            results = ryans.scrape("storage")

        self.assertIn("https://www.ryans.com/category/internal-ssd?limit=100", mock_browser.opened_urls)
        self.assertIn("https://www.ryans.com/category/internal-hdd?limit=100", mock_browser.opened_urls)

        names = [p["name"] for p in results]
        self.assertIn("SSD 1", names)
        self.assertIn("HDD 1", names)


if __name__ == "__main__":
    unittest.main()

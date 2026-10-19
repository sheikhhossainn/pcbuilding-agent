import unittest
from scrapers._common import clean_price, strip_tracking


class TestCommonHelpers(unittest.TestCase):
    def test_clean_price(self):
        self.assertEqual(clean_price("13,800৳"), 13800)
        self.assertEqual(clean_price("Tk 12,500"), 12500)
        self.assertEqual(clean_price("500"), 500)
        self.assertEqual(clean_price(""), None)
        self.assertEqual(clean_price(None), None)
        self.assertEqual(clean_price("Out of stock"), None)

    def test_strip_tracking(self):
        # Empty/None
        self.assertEqual(strip_tracking(""), "")
        self.assertEqual(strip_tracking(None), "")

        # Standard URL without tracking
        url = "https://www.ryans.com/intel-core-i5-12400f"
        self.assertEqual(strip_tracking(url), url)

        # URL with fragment only
        self.assertEqual(
            strip_tracking("https://www.ryans.com/intel-core-i5-12400f#specs"),
            "https://www.ryans.com/intel-core-i5-12400f"
        )

        # URL with UTM parameters
        self.assertEqual(
            strip_tracking("https://www.ryans.com/intel-core-i5-12400f?utm_source=facebook&utm_medium=cpc"),
            "https://www.ryans.com/intel-core-i5-12400f"
        )

        # URL with click IDs and referrals
        self.assertEqual(
            strip_tracking("https://www.ryans.com/product?fbclid=abc123xyz&ref=partner"),
            "https://www.ryans.com/product"
        )

        # URL with tracking and legitimate query parameters preserved
        self.assertEqual(
            strip_tracking("https://www.ryans.com/category/processor?page=2&utm_source=google&limit=40"),
            "https://www.ryans.com/category/processor?page=2&limit=40"
        )


if __name__ == "__main__":
    unittest.main()

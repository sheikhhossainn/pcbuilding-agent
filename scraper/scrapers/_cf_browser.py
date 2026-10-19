import os
import time
from pathlib import Path
from DrissionPage import ChromiumPage, ChromiumOptions


class CloudflareBrowser:
    """Manages a DrissionPage Chromium instance configured to handle Cloudflare challenges.
    
    Features:
    - Runs off-screen with persistent profile per site and dedicated port to avoid collisions.
    - Lazy browser launching on first navigation.
    - Cloudflare detection handling both 'Just a moment...' and Turnstile 'Performing security verification'.
    - Stale element retry helper for recovering from Cloudflare page reloads.
    - Automatically brings window on screen if challenge is stuck after ~10s so a human can solve it,
      then restores it off-screen once cleared.
    """

    def __init__(self, site: str, port: int, profile_dir=None):
        self.site = site
        self.port = port
        if profile_dir is None:
            base_dir = Path(__file__).resolve().parent.parent / ".profiles" / site
            self.profile_dir = str(base_dir)
        else:
            self.profile_dir = str(profile_dir)
        self._page = None

    @property
    def page(self):
        """Returns the active ChromiumPage, launching it lazily if not already started."""
        if self._page is None:
            self.launch()
        return self._page

    def launch(self):
        """Launch the Chromium browser instance."""
        if self._page is not None:
            return self._page

        os.makedirs(self.profile_dir, exist_ok=True)
        co = ChromiumOptions()
        co.set_argument('--window-position=-2000,-2000')
        co.set_argument('--no-sandbox')
        co.set_argument('--disable-gpu')
        co.set_local_port(self.port)
        co.set_user_data_path(self.profile_dir)
        self._page = ChromiumPage(co)
        return self._page

    def is_cloudflare_cleared(self) -> bool:
        """Check if Cloudflare challenge has cleared based on page title."""
        if self._page is None:
            return False
        title = (self._page.title or "").strip()
        if not title:
            return False
        title_lower = title.lower()
        if "just a moment" in title_lower:
            return False
        if "performing security verification" in title_lower:
            return False
        if "security verification" in title_lower:
            return False
        if "attention required" in title_lower:
            return False
        return True

    def wait_for_cloudflare(self, timeout: int = 300) -> bool:
        """Wait for Cloudflare challenge to clear (up to timeout seconds).
        
        If not cleared after ~10 seconds, moves window on-screen so a human can interact
        with any Cloudflare/Turnstile prompt, then moves it back off-screen once cleared.
        """
        window_moved_on_screen = False
        for i in range(timeout):
            if self.is_cloudflare_cleared():
                if window_moved_on_screen:
                    try:
                        self.page.set.window.location(-2000, -2000)
                    except Exception:
                        pass
                if i > 0:
                    print(f"    Cloudflare cleared after {i}s")
                return True

            if i >= 10 and not window_moved_on_screen:
                try:
                    self.page.set.window.location(50, 50)
                    self.page.set.window.size(1280, 850)
                    self.page.set.window.normal()
                    window_moved_on_screen = True
                    print("    Cloudflare challenge not cleared after 10s — moved window on screen (50, 50). "
                          "Please click the verification checkbox in Chrome if prompted.")
                except Exception as e:
                    print(f"    Note: Could not move window on screen: {e}")
            elif i > 0 and i % 15 == 0:
                print(f"    Waiting for Cloudflare verification ({i}s elapsed)... "
                      f"If an interaction/checkbox is shown in the Chrome window, please click it.")

            time.sleep(1)

        if window_moved_on_screen:
            try:
                self.page.set.window.location(-2000, -2000)
            except Exception:
                pass

        print(f"    Cloudflare timeout after {timeout}s - page may not have loaded or cleared challenge")
        return False

    def open(self, url: str, timeout: int = 300) -> bool:
        """Navigate to URL and wait for Cloudflare challenge to clear."""
        page = self.page
        page.get(url)
        return self.wait_for_cloudflare(timeout=timeout)

    def wait_for(self, selector: str, timeout: int = 60):
        """Wait for an element matching selector to be displayed."""
        return self.page.wait.ele_displayed(selector, timeout=timeout)

    def retry_on_stale(self, func, retries: int = 3, retry_delay: float = 3.0):
        """Execute func(page) and retry if elements go stale or exception occurs during Cloudflare reload."""
        for attempt in range(retries):
            try:
                return func(self.page)
            except Exception as e:
                if attempt < retries - 1:
                    time.sleep(retry_delay)
                else:
                    raise

    def close(self):
        """Quit the browser instance if running."""
        if self._page is not None:
            try:
                self._page.quit()
            except Exception:
                pass
            finally:
                self._page = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

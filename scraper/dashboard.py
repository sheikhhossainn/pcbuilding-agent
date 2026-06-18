"""
BuildMyPC Scraper Dashboard — Local web UI for monitoring and controlling the scraper.

Run:
    python dashboard.py

Opens at http://localhost:8501
"""

import asyncio
import json
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse

import sync_db

app = FastAPI(title="BuildMyPC Scraper Dashboard")

# ── Shared State ──────────────────────────────────────────────────────────────

class ScraperState:
    def __init__(self):
        self.running = False
        self.stop_event = threading.Event()
        self.thread = None
        self.logs = deque(maxlen=500)
        self.progress = {}
        self.last_run = None
        self.error = None
        self._log_subscribers = []
        self._lock = threading.Lock()

    def add_log(self, message: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = {"time": timestamp, "message": message}
        with self._lock:
            self.logs.append(entry)
            # Notify all SSE subscribers
            for queue in self._log_subscribers:
                try:
                    queue.put_nowait(entry)
                except:
                    pass

    def subscribe_logs(self):
        """Create a queue for an SSE subscriber."""
        import queue
        q = queue.Queue(maxsize=100)
        with self._lock:
            self._log_subscribers.append(q)
        return q

    def unsubscribe_logs(self, q):
        with self._lock:
            if q in self._log_subscribers:
                self._log_subscribers.remove(q)

    def update_progress(self, data: dict):
        self.progress = data
        # Also push progress as a special log-type event
        with self._lock:
            for queue in self._log_subscribers:
                try:
                    queue.put_nowait({"__progress__": True, **data})
                except:
                    pass


scraper_state = ScraperState()


# ── Scraper Thread ────────────────────────────────────────────────────────────

def _run_scraper():
    """Target function for the scraper thread."""
    scraper_state.running = True
    scraper_state.error = None
    scraper_state.stop_event.clear()

    try:
        sync_db.run_sync(
            stop_event=scraper_state.stop_event,
            log_callback=scraper_state.add_log,
            progress_callback=scraper_state.update_progress,
        )
    except Exception as e:
        scraper_state.error = str(e)
        scraper_state.add_log(f"✗ Fatal error: {e}")
    finally:
        scraper_state.running = False
        scraper_state.last_run = datetime.now().isoformat()
        scraper_state.add_log("Scraper stopped.")


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    html_path = Path(__file__).parent / "templates" / "dashboard.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))


@app.post("/api/start")
async def start_scraper():
    if scraper_state.running:
        return JSONResponse({"status": "already_running"}, status_code=409)

    scraper_state.logs.clear()
    scraper_state.progress = {}
    scraper_state.thread = threading.Thread(target=_run_scraper, daemon=True)
    scraper_state.thread.start()
    return {"status": "started"}


@app.post("/api/stop")
async def stop_scraper():
    if not scraper_state.running:
        return JSONResponse({"status": "not_running"}, status_code=409)

    scraper_state.stop_event.set()
    scraper_state.add_log("⏹ Stop signal sent. Finishing current category...")
    return {"status": "stopping"}


@app.get("/api/status")
async def get_status():
    state = sync_db.load_state()
    sites = sync_db.SITES
    
    # Calculate overall progress
    total = sum(len(s["categories"]) for s in sites)
    completed = sum(state.get(s["name"], 0) for s in sites)
    
    return {
        "running": scraper_state.running,
        "stopping": scraper_state.stop_event.is_set(),
        "progress": scraper_state.progress,
        "state": state,
        "overall_progress": completed,
        "overall_total": total,
        "last_run": scraper_state.last_run,
        "error": scraper_state.error,
    }


@app.get("/api/stats")
async def get_stats():
    stats = sync_db.get_supabase_stats()
    
    # Compute site totals
    site_totals = {}
    for row in stats:
        site = row["site"]
        if site not in site_totals:
            site_totals[site] = {"site": site, "in_stock": 0, "out_of_stock": 0, "total": 0}
        site_totals[site]["in_stock"] += row["in_stock"]
        site_totals[site]["out_of_stock"] += row["out_of_stock"]
        site_totals[site]["total"] += row["total"]

    return {
        "categories": stats,
        "sites": list(site_totals.values()),
    }


@app.get("/api/logs")
async def stream_logs(request: Request):
    """SSE endpoint that streams log entries and progress updates."""
    q = scraper_state.subscribe_logs()

    async def event_generator():
        try:
            # Send existing logs first
            for entry in list(scraper_state.logs):
                yield {"event": "log", "data": json.dumps(entry)}

            # Stream new logs
            while True:
                if await request.is_disconnected():
                    break
                try:
                    entry = await asyncio.get_event_loop().run_in_executor(None, lambda: q.get(timeout=1))
                    if entry.get("__progress__"):
                        yield {"event": "progress", "data": json.dumps(entry)}
                    else:
                        yield {"event": "log", "data": json.dumps(entry)}
                except:
                    # Timeout — send keepalive
                    yield {"event": "ping", "data": ""}
        finally:
            scraper_state.unsubscribe_logs(q)

    return EventSourceResponse(event_generator())


@app.get("/api/state")
async def get_sync_state():
    """Return the raw sync_state.json for the UI to show resume info."""
    return sync_db.load_state()


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("")
    print("  BuildMyPC Scraper Dashboard")
    print("  http://localhost:8501")
    print("")
    uvicorn.run(app, host="127.0.0.1", port=8501, log_level="warning")

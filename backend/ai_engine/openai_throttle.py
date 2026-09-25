"""Keep OpenAI calls inside the organization's rate limit instead of failing.

Two layers, both needed:

* `TokenBudget` -- a sliding one-minute token window shared by every vision
  call in the process. A 20-garment batch needs more tokens than the 30k
  tokens-per-minute the account started on, and the old behaviour was to
  fire them all at once and let half of them 429. Pacing the calls up front
  is what actually keeps a batch inside the limit; the limit itself is read
  from OpenAI's response headers, so a higher account tier is used as soon
  as OpenAI grants it.
* `call_with_rate_limit_retry` -- for the calls that still get a 429 (the
  estimate is approximate; other traffic shares the limit), wait exactly
  as long as OpenAI asks ("Please try again in 4.024s") and retry, rather
  than giving up. A garment with no attributes is a garment the matcher
  cannot veto, which is how leggings ended up merged with a bodysuit.
"""
from __future__ import annotations

import random
import re
import threading
import time
from collections import deque
from collections.abc import Callable
from typing import Any, TypeVar

from openai import OpenAI, RateLimitError

from ai_engine.config import SETTINGS

T = TypeVar("T")

_RETRY_IN = re.compile(r"try again in\s*(\d+(?:\.\d+)?)\s*(ms|s)\b", re.IGNORECASE)


class TokenBudget:
    """Sliding one-minute token window. Each call reserves its expected size
    up front and is corrected to what it really used once it returns, so the
    window tracks real usage in both directions -- reserving 3k for a call
    that used 1.7k would otherwise waste ~40% of the minute's budget."""

    # Leave a little headroom under the published limit: the listing-copy
    # call and any other traffic on the org share it.
    _HEADROOM = 0.95

    def __init__(
        self,
        tokens_per_minute: int,
        initial_estimate: int = 3000,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._limit = max(1, int(tokens_per_minute))
        self._estimate = max(1.0, float(initial_estimate))
        self._clock = clock
        self._sleep = sleep
        self._lock = threading.Lock()
        self._window: deque[list] = deque()  # [timestamp, tokens]

    @property
    def limit(self) -> int:
        return self._limit

    @property
    def estimate(self) -> int:
        return int(round(self._estimate))

    def _prune(self, now: float) -> None:
        while self._window and self._window[0][0] <= now - 60.0:
            self._window.popleft()

    def used(self) -> int:
        with self._lock:
            self._prune(self._clock())
            return sum(entry[1] for entry in self._window)

    def observe_limit(self, header_value: str | int | None) -> None:
        """Adopt the org's real limit from OpenAI's `x-ratelimit-limit-tokens`."""
        try:
            limit = int(header_value) if header_value is not None else 0
        except (TypeError, ValueError):
            return
        if limit > 0:
            with self._lock:
                self._limit = max(1, int(limit * self._HEADROOM))

    def acquire(self, estimate: int | None = None) -> list:
        """Block until the call fits in the current minute, then reserve it.
        A single call larger than the whole budget is let through alone
        rather than waiting forever. Returns the reservation for `settle`."""
        while True:
            with self._lock:
                size = int(round(self._estimate)) if estimate is None else max(0, int(estimate))
                now = self._clock()
                self._prune(now)
                used = sum(entry[1] for entry in self._window)
                if used + size <= self._limit or not self._window:
                    entry = [now, size]
                    self._window.append(entry)
                    return entry
                wait = self._window[0][0] + 60.0 - now
            self._sleep(max(wait, 0.05))

    def settle(self, reservation: list, actual: int | None) -> None:
        """Replace the reservation with what the call really used, and learn
        the typical call size for the next reservation."""
        if actual is None or actual <= 0:
            return
        with self._lock:
            reservation[1] = int(actual)
            self._estimate = 0.7 * self._estimate + 0.3 * float(actual)


def retry_after_seconds(exc: BaseException) -> float | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers:
        ms = headers.get("retry-after-ms")
        if ms:
            try:
                return float(ms) / 1000.0
            except ValueError:
                pass
        seconds = headers.get("retry-after")
        if seconds:
            try:
                return float(seconds)
            except ValueError:
                pass
    match = _RETRY_IN.search(str(exc))
    if match:
        value, unit = match.groups()
        return float(value) / (1000.0 if unit.lower() == "ms" else 1.0)
    return None


def call_with_rate_limit_retry(
    fn: Callable[[], T],
    *,
    max_retries: int | None = None,
    label: str = "",
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    attempts = SETTINGS.openai_max_retries if max_retries is None else max_retries
    for attempt in range(attempts + 1):
        try:
            return fn()
        except RateLimitError as exc:
            if attempt >= attempts:
                raise
            wait = retry_after_seconds(exc)
            if wait is None:
                wait = min(2.0**attempt, 20.0)
            wait = min(wait, 60.0) + random.uniform(0.2, 1.0)
            print(f"[openai] rate limited{f' ({label})' if label else ''}; retry {attempt + 1}/{attempts} in {wait:.1f}s")
            sleep(wait)
    raise AssertionError("unreachable")


_client: OpenAI | None = None
_client_lock = threading.Lock()


def get_client() -> OpenAI:
    global _client
    with _client_lock:
        if _client is None:
            _client = OpenAI(api_key=SETTINGS.openai_api_key)
        return _client


VISION_BUDGET = TokenBudget(SETTINGS.openai_vision_tpm, SETTINGS.openai_vision_tokens_per_call)


def usage_total_tokens(response: Any) -> int | None:
    usage = getattr(response, "usage", None)
    total = getattr(usage, "total_tokens", None)
    return int(total) if isinstance(total, int) else None

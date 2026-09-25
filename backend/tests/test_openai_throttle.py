from __future__ import annotations

import httpx
import pytest
from openai import RateLimitError

from ai_engine import openai_throttle
from ai_engine.openai_throttle import TokenBudget, call_with_rate_limit_retry, retry_after_seconds


class FakeClock:
    def __init__(self):
        self.now = 1000.0
        self.sleeps: list[float] = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def _rate_limit_error(message="Rate limit reached for gpt-4o on tokens per min (TPM): Limit 30000. Please try again in 4.024s.", headers=None):
    response = httpx.Response(429, request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"), headers=headers or {})
    return RateLimitError(message, response=response, body=None)


def test_budget_lets_a_full_minute_through_then_paces_the_rest():
    clock = FakeClock()
    budget = TokenBudget(30000, clock=clock, sleep=clock.sleep)
    for _ in range(10):
        budget.acquire(3000)
    assert clock.sleeps == []  # 10 x 3000 = exactly the limit, no waiting
    assert budget.used() == 30000

    budget.acquire(3000)  # 11th call must wait for the first reservation to expire
    assert clock.sleeps and pytest.approx(clock.sleeps[0], abs=0.01) == 60.0
    assert budget.used() == 3000  # the ten from the previous minute have rolled off


def test_budget_never_deadlocks_on_a_call_bigger_than_the_limit():
    clock = FakeClock()
    budget = TokenBudget(1000, clock=clock, sleep=clock.sleep)
    budget.acquire(5000)
    assert clock.sleeps == []


def test_settle_replaces_the_reservation_with_real_usage_both_ways():
    clock = FakeClock()
    budget = TokenBudget(30000, clock=clock, sleep=clock.sleep)
    r1 = budget.acquire(3000)
    budget.settle(r1, 1700)          # used less: the difference is freed
    assert budget.used() == 1700
    r2 = budget.acquire(3000)
    budget.settle(r2, 3400)          # used more: charged in full
    assert budget.used() == 1700 + 3400
    r3 = budget.acquire(3000)
    budget.settle(r3, None)          # unknown usage: reservation stands
    assert budget.used() == 1700 + 3400 + 3000


def test_under_used_reservations_let_more_calls_into_the_same_minute():
    # 30k TPM at ~1.7k real tokens per call fits 17 calls a minute, not the
    # 10 a fixed 3k reservation would allow.
    clock = FakeClock()
    budget = TokenBudget(30000, initial_estimate=3000, clock=clock, sleep=clock.sleep)
    for _ in range(17):
        budget.settle(budget.acquire(), 1700)
    assert clock.sleeps == []


def test_budget_learns_the_typical_call_size():
    clock = FakeClock()
    budget = TokenBudget(30000, initial_estimate=3000, clock=clock, sleep=clock.sleep)
    for _ in range(20):
        budget.settle(budget.acquire(), 1700)
    assert 1650 <= budget.estimate <= 1800


def test_observed_rate_limit_header_replaces_the_configured_limit():
    budget = TokenBudget(30000)
    budget.observe_limit("450000")   # the account moved up an OpenAI tier
    assert budget.limit == int(450000 * 0.95)
    budget.observe_limit(None)
    budget.observe_limit("not-a-number")
    budget.observe_limit("0")
    assert budget.limit == int(450000 * 0.95)


def test_retry_after_parses_openai_message_and_headers():
    assert retry_after_seconds(_rate_limit_error()) == pytest.approx(4.024)
    assert retry_after_seconds(_rate_limit_error("slow down, please try again in 250ms")) == pytest.approx(0.25)
    assert retry_after_seconds(_rate_limit_error("no hint here")) is None
    assert retry_after_seconds(_rate_limit_error("x", headers={"retry-after-ms": "1500"})) == pytest.approx(1.5)
    assert retry_after_seconds(_rate_limit_error("x", headers={"retry-after": "7"})) == pytest.approx(7.0)


def test_retry_waits_what_openai_asked_then_succeeds():
    attempts = {"n": 0}

    def flaky():
        attempts["n"] += 1
        if attempts["n"] <= 2:
            raise _rate_limit_error()
        return "ok"

    sleeps: list[float] = []
    assert call_with_rate_limit_retry(flaky, max_retries=6, sleep=sleeps.append) == "ok"
    assert attempts["n"] == 3
    assert len(sleeps) == 2
    assert all(4.2 <= s <= 5.1 for s in sleeps)  # 4.024s + a little jitter


def test_retry_gives_up_after_max_retries():
    calls = {"n": 0}

    def always():
        calls["n"] += 1
        raise _rate_limit_error()

    with pytest.raises(RateLimitError):
        call_with_rate_limit_retry(always, max_retries=2, sleep=lambda s: None)
    assert calls["n"] == 3


def test_other_errors_are_not_retried():
    def boom():
        raise ValueError("not a rate limit")

    with pytest.raises(ValueError):
        call_with_rate_limit_retry(boom, max_retries=5, sleep=lambda s: None)


def test_default_retries_come_from_settings():
    assert openai_throttle.SETTINGS.openai_max_retries >= 1

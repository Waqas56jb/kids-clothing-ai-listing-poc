from __future__ import annotations

import itertools
import random

import pytest

from ai_engine.assignment import min_cost_assignment


def test_matches_brute_force_on_random_matrices():
    rnd = random.Random(7)
    for _ in range(300):
        n = rnd.randint(1, 5)
        m = rnd.randint(n, 7)
        cost = [[rnd.choice([rnd.uniform(-1, 1), 1e6]) for _ in range(m)] for _ in range(n)]
        got = min_cost_assignment(cost)
        assert len(set(got)) == n
        best = min(sum(cost[i][p[i]] for i in range(n)) for p in itertools.permutations(range(m), n))
        assert sum(cost[i][got[i]] for i in range(n)) == pytest.approx(best)


def test_empty_and_invalid_shapes():
    assert min_cost_assignment([]) == []
    with pytest.raises(ValueError):
        min_cost_assignment([[1.0], [2.0]])

"""Minimum-cost assignment (Hungarian algorithm, O(n^2 m)) for the small
matrices the garment matcher builds -- a few dozen detections per photo at
most, so a dependency the size of SciPy isn't worth it for this alone."""
from __future__ import annotations

import math


def min_cost_assignment(cost: list[list[float]]) -> list[int]:
    """For an n x m cost matrix with n <= m, the column assigned to each row
    such that every row gets a distinct column and the total cost is
    minimal."""
    n = len(cost)
    if n == 0:
        return []
    m = len(cost[0])
    if m < n:
        raise ValueError("need at least as many columns as rows")

    # 1-indexed potentials/matching, the standard formulation.
    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    match = [0] * (m + 1)  # match[j] = row assigned to column j
    way = [0] * (m + 1)
    for i in range(1, n + 1):
        match[0] = i
        j0 = 0
        minv = [math.inf] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[j0] = True
            i0, delta, j1 = match[j0], math.inf, 0
            for j in range(1, m + 1):
                if used[j]:
                    continue
                cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                if cur < minv[j]:
                    minv[j], way[j] = cur, j0
                if minv[j] < delta:
                    delta, j1 = minv[j], j
            for j in range(m + 1):
                if used[j]:
                    u[match[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if match[j0] == 0:
                break
        while True:
            j1 = way[j0]
            match[j0] = match[j1]
            j0 = j1
            if j0 == 0:
                break

    result = [0] * n
    for j in range(1, m + 1):
        if match[j]:
            result[match[j] - 1] = j - 1
    return result

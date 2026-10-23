"""Boulders rock_0..2 (1-3 m). Displaced icosphere, then clipped by a few random planes so the
silhouette gets big flat facets (chunky, cel-shading friendly), flattened at the base.
rock_2 gets a smaller companion stone."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import Vector, blob, clear, finish, join, mat, rng  # noqa: E402

# (seed, size m, squash, companion)
VARIANTS = [(3, 1.2, (1.0, 0.85, 0.75), False), (8, 2.0, (1.25, 0.9, 0.6), False), (13, 2.9, (1.1, 1.0, 0.7), True)]


def facet(o, r, planes=4):
    vs = o.data.vertices
    c = sum((v.co for v in vs), Vector()) / len(vs)
    rad = max((v.co - c).length for v in vs)
    for _ in range(planes):
        th, ph = r.uniform(0, 2 * math.pi), r.uniform(-0.3, 1.2)
        n = Vector((math.cos(th) * math.cos(ph), math.sin(th) * math.cos(ph), math.sin(ph)))
        d = rad * r.uniform(0.6, 0.8)
        for v in vs:
            k = (v.co - c).dot(n) - d
            if k > 0:
                v.co -= n * k


def rock(r, size, squash, centre=(0, 0, 0)):
    o = blob(centre, size / 2, r, mat("rock"), subdiv=2, jitter=0.18, squash=squash)
    facet(o, r)
    return o


for idx, (seed, size, squash, companion) in enumerate(VARIANTS):
    clear()
    r = rng(seed)
    parts = [rock(r, size, squash)]
    if companion:
        parts.append(rock(r, size * 0.38, (1.0, 0.9, 0.8), centre=(size * 0.55, -size * 0.3, 0)))
    o = join(parts, "rock")
    zmin = min(v.co.z for v in o.data.vertices)
    sink = 0.12 * size  # bury the bottom a bit then flatten what is below ground
    for v in o.data.vertices:
        v.co.z = max(0.0, v.co.z - zmin - sink)
    name = f"rock_{idx}"
    o.name = name
    finish(name, 300, size_range=((0.8, 0.8, 0.5), (4.2, 4.2, 3.0)), require_materials=("rock",))

"""Tiered cone pines (sugi-like silhouette): tree_pine_0..2, 9-14 m.

Trunk + stacked drooping cone skirts with jittered rims and small tilts so the outline is
ragged rather than a perfect cone. Materials: pine (violet-dark) + trunk.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import Vector, bpy, clear, finish, join, lathe, mat, rng, rod  # noqa: E402

# (seed, height, tiers, max radius)
VARIANTS = [(5, 11.0, 6, 2.3), (17, 14.0, 8, 2.6), (29, 9.0, 5, 2.0)]


def jitter(o, r, amount, droop):
    for v in o.data.vertices:
        rad = math.hypot(v.co.x, v.co.y)
        if rad > 0.05:
            k = 1 + r.uniform(-amount, amount)
            v.co.x *= k
            v.co.y *= k
            v.co.z -= r.uniform(0, droop)


def build(seed, h, n, rmax):
    r = rng(seed)
    parts = [rod((0, 0, -0.05), (0, 0, h * 0.8), 0.26 * h / 11, 0.1, mat("trunk"), verts=6)]
    needles = mat("pine")
    z0 = h * 0.22
    step = (h - z0) / (n + 0.6)
    for i in range(n):
        f = i / (n - 1)
        top = i == n - 1
        rad = rmax * (1 - f) ** 0.85 + 0.55
        zb = z0 + i * step
        th = step * (2.4 if top else 1.75)
        prof = [(0.0, th), (rad * 0.55, th * 0.45), (rad, 0.0), (rad * 0.62, th * 0.12)]
        tier = lathe(prof, segs=9, m=needles, phase=r.uniform(0, 40), loc=(0, 0, zb),
                     rot=(r.uniform(-4, 4), r.uniform(-4, 4), 0))
        jitter(tier, r, 0.16, 0.18 * (1 - f))
        tier.location = Vector((r.uniform(-0.15, 0.15), r.uniform(-0.15, 0.15), 0))
        parts.append(tier)
    o = join(parts, "tree")
    for v in o.data.vertices:  # bake: lowest skirt never below the ground
        v.co.z = max(v.co.z, 0.0)
    zmax = max(v.co.z for v in o.data.vertices)
    for v in o.data.vertices:
        v.co.z *= h / zmax
    return o


for idx, (seed, h, n, rmax) in enumerate(VARIANTS):
    clear()
    o = build(seed, h, n, rmax)
    name = f"tree_pine_{idx}"
    o.name = name
    finish(name, 900, size_range=((2.5, 2.5, 9), (8, 8, 14.2)), require_materials=("pine", "trunk"))

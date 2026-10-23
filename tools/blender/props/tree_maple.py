"""Autumn Japanese maples: tree_maple_0..3 (one export per seed).

Structure: leaning trunk -> fork -> 3-5 main limbs, each with a side branch; chunky displaced
icosphere foliage clusters on every limb tip plus a crown cap. Flat palette colours, two
foliage materials mixed on some variants.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import Vector, blob, clear, finish, join, mat, rng, rod  # noqa: E402

# (seed, height m, foliage materials with weights)
VARIANTS = [
    (11, 8.5, [("foliage_red", 0.85), ("foliage_orange", 0.15)]),
    (23, 7.0, [("foliage_orange", 1.0)]),
    (37, 10.5, [("foliage_amber", 0.6), ("foliage_orange", 0.4)]),
    (41, 6.2, [("foliage_red", 0.55), ("foliage_orange", 0.45)]),
]


def pick(r, mats):
    x, acc = r.random(), 0.0
    for name, w in mats:
        acc += w
        if x <= acc:
            return mat(name)
    return mat(mats[-1][0])


def build(seed, h, mats):
    r = rng(seed)
    bark = mat("trunk")
    trunk, leaves = [], []
    s = h / 8.0  # size factor
    lean = Vector((r.uniform(-0.4, 0.4), r.uniform(-0.4, 0.4), 0)) * s
    knee = Vector((0, 0, h * 0.16)) + lean * 0.4
    fork = Vector((0, 0, h * 0.3)) + lean
    trunk.append(rod((0, 0, -0.1), knee, 0.38 * s, 0.3 * s, bark, verts=7))
    trunk.append(rod(knee, fork, 0.3 * s, 0.21 * s, bark, verts=7, caps=False))
    n = r.randint(3, 5)
    base_a = r.uniform(0, 360)
    clusters = []  # (centre, radius)
    for i in range(n):
        a = math.radians(base_a + i * 360 / n + r.uniform(-20, 20))
        el = math.radians(r.uniform(38, 68))
        ln = h * r.uniform(0.42, 0.55)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        mid = fork + d * ln * 0.5 + Vector((0, 0, r.uniform(-0.1, 0.3) * s))
        end = fork + d * ln
        trunk.append(rod(fork, mid, 0.19 * s, 0.12 * s, bark, verts=5, caps=False))
        trunk.append(rod(mid, end, 0.11 * s, 0.05 * s, bark, verts=5, caps=False))
        clusters.append((end, h * r.uniform(0.13, 0.16)))
        # side branch from the middle of the limb, flaring out and drooping a little
        a2 = a + math.radians(r.choice((-1, 1)) * r.uniform(40, 70))
        d2 = Vector((math.cos(a2), math.sin(a2), r.uniform(-0.05, 0.35))).normalized()
        end2 = mid + d2 * ln * r.uniform(0.45, 0.6)
        trunk.append(rod(mid, end2, 0.07 * s, 0.03 * s, bark, verts=4, caps=False))
        clusters.append((end2, h * r.uniform(0.1, 0.125)))
        # secondary cluster hugging the limb, gives the canopy layered depth
        p3 = fork + d * ln * 0.72 + Vector((r.uniform(-0.5, 0.5), r.uniform(-0.5, 0.5), -0.25)) * s
        clusters.append((p3, h * r.uniform(0.1, 0.12)))
    # top cluster above the fork, slightly off-centre
    clusters.append((fork + Vector((r.uniform(-0.6, 0.6) * s, r.uniform(-0.6, 0.6) * s, h * 0.42)), h * 0.14))
    for (p, rad) in clusters:
        leaves.append(blob(p, rad, r, pick(r, mats), subdiv=2, jitter=0.2,
                           squash=(1.15, 1.15, r.uniform(0.75, 0.9))))
    # a few small loose tufts for silhouette breakup
    for _ in range(4):
        p, rad = r.choice(clusters)
        off = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-0.8, 0.4))).normalized() * rad * 1.05
        leaves.append(blob(p + off, rad * 0.45, r, pick(r, mats), subdiv=1, jitter=0.15))
    join(trunk + leaves, "tree")
    # clamp: nothing below ground, crown top at the target height
    o = [ob for ob in __import__("bpy").data.objects if ob.type == "MESH"][0]
    zmax = max(v.co.z for v in o.data.vertices)
    for v in o.data.vertices:
        v.co.z = max(0.0, v.co.z * h / zmax)
    return o


for idx, (seed, h, mats) in enumerate(VARIANTS):
    clear()
    build(seed, h, mats)
    name = f"tree_maple_{idx}"
    __import__("bpy").data.objects[0].name = name
    finish(name, 1800, size_range=((3, 3, 6), (12, 12, 11.2)),
           require_materials=("trunk",) + tuple(m for m, _ in mats))

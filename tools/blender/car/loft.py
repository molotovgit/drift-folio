"""Geometry helpers for the car scripts: keyframe interpolation, profile lofting, lathing.

Everything here is pure bmesh/mathutils so it can be reused by other vehicles.
"""
import math

import bmesh
import bpy


# --------------------------------------------------------------------------- interpolation
def pchip(keys):
    """Monotone cubic (Fritsch-Carlson) interpolator over [(x, y), ...] sorted by x.

    No overshoot, so body lines never bulge past the keyframes.
    """
    xs = [k[0] for k in keys]
    ys = [k[1] for k in keys]
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = max(j for j in range(n - 1) if xs[j] <= x)
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


def tracks(table):
    """{'param': [(y, v), ...]} -> callable(y) -> {'param': v}."""
    fns = {k: pchip(v) for k, v in table.items()}
    return lambda y: {k: f(y) for k, f in fns.items()}


def catmull(points, sub=2):
    """Open uniform Catmull-Rom through 2D points, `sub` samples per segment."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for s in range(sub):
            t = s / sub
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
                       + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3) for c in range(2)))
    out.append(points[-1])
    return out


# --------------------------------------------------------------------------- lofting
def loft(name, stations, half_profile, closed=True, cap=True, material_fn=None, mats=()):
    """Loft a symmetric body along Blender Y.

    stations: list of y values.
    half_profile(y) -> [(x, z), ...] from bottom centre (x=0) round to top centre (x=0),
      x >= 0. Every station must return the same number of points.
    closed: ring wraps underneath (first/last point on the centreline). If False the profile
      is mirrored into an open arch: only the last point lies on the centreline.
    material_fn(centre, i_station, j_seg) -> material slot index.
    """
    bm = bmesh.new()
    rings = []
    for y in stations:
        half = half_profile(y)
        if closed:
            ring = [(x, z) for x, z in half] + [(-x, z) for x, z in reversed(half[1:-1])]
        else:
            ring = [(-x, z) for x, z in half] + [(x, z) for x, z in reversed(half[:-1])]
        rings.append([bm.verts.new((x, y, z)) for x, z in ring])
    nr = len(rings[0])
    seg_count = nr if closed else nr - 1
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(seg_count):
            j2 = (j + 1) % nr
            f = bm.faces.new((a[j], a[j2], b[j2], b[j]))
            if material_fn:
                f.material_index = material_fn(f.calc_center_median(), i, j)
    if cap and closed:
        for ring, idx in ((rings[0], 0), (rings[-1], len(rings) - 1)):
            f = bm.faces.new(ring)
            if material_fn:
                f.material_index = material_fn(f.calc_center_median(), idx, -1)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object(bm, name, mats)


def to_object(bm, name, mats=()):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def lathe(bm, profile, segments, material_index=0, axis_x=True):
    """Spin a [(x, r), ...] profile around the X axis into bm. Returns faces."""
    rings = []
    for s in range(segments):
        a = 2 * math.pi * s / segments
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((x, r * sa, -r * ca)) for x, r in profile])
    faces = []
    for s in range(segments):
        a, b = rings[s], rings[(s + 1) % segments]
        for j in range(len(profile) - 1):
            if profile[j][1] < 1e-6 and profile[j + 1][1] < 1e-6:
                continue
            f = bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
            f.material_index = material_index
            faces.append(f)
    return faces


def box(bm, centre, size, material_index=0, rot_x=0.0):
    """Axis aligned (optionally X-rotated) box into bm."""
    cx, cy, cz = centre
    sx, sy, sz = (s / 2 for s in size)
    c, s = math.cos(rot_x), math.sin(rot_x)
    vs = []
    for dx, dy, dz in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                       (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)):
        y, z = dy * sy, dz * sz
        vs.append(bm.verts.new((cx + dx * sx, cy + y * c - z * s, cz + y * s + z * c)))
    faces = []
    for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        f = bm.faces.new([vs[i] for i in q])
        f.material_index = material_index
        faces.append(f)
    return faces

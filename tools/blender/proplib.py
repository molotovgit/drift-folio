"""Geometry helpers for the environment prop scripts in tools/blender/props/.

Everything is built straight into bmesh in world coordinates (transforms baked, object
origin at the world origin) so parts can be joined without operator context juggling.
Angles are in degrees. See lib.py for the asset conventions.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import Vector, args, bmesh, bpy, clear, export, mat, preview, tri_count, bounds  # noqa: E402,F401
from mathutils import Euler, Matrix  # noqa: E402


def _rot_matrix(rot):
    return Euler([math.radians(a) for a in rot], "XYZ").to_matrix()


def _finish_bm(bm, name, mats):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if mats is not None:
        for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
            o.data.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    return o


def _place(bm, loc=(0, 0, 0), rot=None, pivot=(0, 0, 0)):
    if rot and any(rot):
        bmesh.ops.rotate(bm, verts=bm.verts, cent=pivot, matrix=_rot_matrix(rot))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)


def box(size, loc=(0, 0, 0), m=None, rot=None, bevel=0.0, name="box"):
    """Axis box of full size (sx, sy, sz) centred at loc."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES", profile=0.5)
    _place(bm, loc, rot)
    return _finish_bm(bm, name, m)


def cyl(r, h, loc=(0, 0, 0), m=None, verts=8, r2=None, rot=None, name="cyl"):
    """Cylinder/frustum standing on loc (base centre), height h along +Z before rot."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r,
                          radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    _place(bm, loc, rot)
    return _finish_bm(bm, name, m)


def rod(p0, p1, r0, r1=None, m=None, verts=6, caps=True, name="rod"):
    """Tapered cylinder from point p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=verts, radius1=r0,
                          radius2=r0 if r1 is None else r1, depth=d.length)
    bmesh.ops.translate(bm, vec=(0, 0, d.length / 2), verts=bm.verts)
    q = d.normalized().to_track_quat("Z", "Y")
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=p0, verts=bm.verts)
    return _finish_bm(bm, name, m)


def lathe(profile, segs=12, loc=(0, 0, 0), m=None, rot=None, closed=False, seg_mat=None,
          phase=0.0, name="lathe"):
    """Revolve [(r, z), ...] around +Z. Open profiles get caps where r > 0 at the ends.
    seg_mat: optional material index per profile segment (m must then be a list)."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs + math.radians(phase)
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    n = len(profile) if closed else len(profile) - 1
    for k in range(n):
        a, b = rings[k], rings[(k + 1) % len(rings)]
        for i in range(segs):
            j = (i + 1) % segs
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            if seg_mat:
                f.material_index = seg_mat[k]
    if not closed:
        if profile[0][0] > 1e-6:
            f = bm.faces.new(list(reversed(rings[0])))
            if seg_mat:
                f.material_index = seg_mat[0]
        if profile[-1][0] > 1e-6:
            f = bm.faces.new(rings[-1])
            if seg_mat:
                f.material_index = seg_mat[-1]
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    _place(bm, loc, rot)
    return _finish_bm(bm, name, m)


def sweep(profile, length, loc=(0, 0, 0), m=None, axis="X", rot=None, name="sweep"):
    """Extrude a closed 2D polygon. axis X: profile is (y, z); axis Y: (x, z); axis Z: (x, y).
    The extrusion is centred on loc along the axis."""
    bm = bmesh.new()
    rings = []
    for s in (-length / 2, length / 2):
        ring = []
        for (a, z) in profile:
            co = {"X": (s, a, z), "Y": (a, s, z), "Z": (a, z, s)}[axis]
            ring.append(bm.verts.new(co))
        rings.append(ring)
    k = len(profile)
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[1])))
    _place(bm, loc, rot)
    return _finish_bm(bm, name, m)


def gable_profile(half, ridge, drop, thick, sag=0.7, flick=0.1, rows=0, lip=0.07, n=6):
    """Cross-section (y, z) of a curved Japanese gable roof for sweep(axis="X").
    half: half span to the eave tip; the top surface sags (sag < 1) and the eave tips flick up.
    rows > 0 adds a sawtooth lip per tile row so the roof reads as tiled."""
    def zf(u):
        return ridge - drop * (u ** sag)
    desc = [(0.0, zf(0.0))]
    if rows:
        for k in range(rows):
            u1 = (k + 1) / rows
            desc.append((u1, zf(u1) + lip))
            desc.append((u1, zf(u1)))
        desc.pop()
    else:
        desc += [(i / n, zf(i / n)) for i in range(1, n + 1)]
    desc[-1] = (desc[-1][0], desc[-1][1] + flick)
    top = [(-half * u, z) for (u, z) in reversed(desc)] + [(half * u, z) for (u, z) in desc[1:]]
    bot = [(i / n, zf(i / n) - thick) for i in range(n + 1)]
    bot[-1] = (1.0, bot[-1][1] + flick)
    bottom = [(half * u, z) for (u, z) in reversed(bot)] + [(-half * u, z) for (u, z) in bot[1:]]
    return top + bottom


def chochin(top, h=0.6, segs=10):
    """Hanging paper lantern hung from point `top` (hook), total height h. Returns parts."""
    x, y, z = top
    paper, ink = mat("paper_lantern"), mat("ink")
    body_h = h * 0.74
    rmax = h * 0.3
    z1 = z - h * 0.13  # top of paper body
    prof = []
    for i in range(7):
        t = i / 6
        prof.append((rmax * (0.62 + 0.38 * math.sin(math.pi * t)), z1 - body_h * t))
    parts = [lathe(prof, segs=segs, m=paper)]
    parts.append(cyl(rmax * 0.66, h * 0.07, (x, y, z1 - 0.005), ink, verts=segs))           # top cap
    parts.append(cyl(rmax * 0.66, h * 0.07, (x, y, z1 - body_h - h * 0.065), ink, verts=segs))  # bottom cap
    parts.append(box((h * 0.03, h * 0.03, h * 0.07), (x, y, z - h * 0.035), ink))           # hook
    parts.append(box((h * 0.03, h * 0.03, h * 0.08), (x, y, z1 - body_h - h * 0.105), ink))  # tassel stub
    parts[0].data.transform(Matrix.Translation((x, y, 0)))
    return parts


def blob(center, radius, rnd, m=None, subdiv=2, jitter=0.22, squash=(1, 1, 0.8), name="blob"):
    """Displaced low-poly icosphere: the chunky foliage / boulder primitive."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in bm.verts:
        v.co *= 1 + rnd.uniform(-jitter, jitter)
        v.co = Vector((v.co.x * squash[0], v.co.y * squash[1], v.co.z * squash[2])) * radius
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return _finish_bm(bm, name, m)


def hull(points, m=None, name="hull"):
    """Convex hull solid of the given points (hip roofs, chunky rocks, wedges)."""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in points]
    res = bmesh.ops.convex_hull(bm, input=vs)
    junk = [g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)]
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.dissolve_limit(bm, angle_limit=0.01, verts=bm.verts, edges=bm.edges)
    return _finish_bm(bm, name, m)


def poly_prism(points, depth, loc=(0, 0, 0), m=None, rot=None, name="prism"):
    """Closed polygon in the XZ plane extruded along Y (depth centred on loc)."""
    return sweep(points, depth, loc=loc, m=m, axis="Y", rot=rot, name=name)


def planar_uv(o, axis="Y"):
    """Project UVs onto the plane perpendicular to axis, normalised to 0..1 over the bounds.
    For axis Y the -Y (front) face reads u = +X, v = +Z."""
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    ia, ib = {"Y": (0, 2), "X": (1, 2), "Z": (0, 1)}[axis]
    cs = [v.co for v in me.vertices]
    lo_a, hi_a = min(c[ia] for c in cs), max(c[ia] for c in cs)
    lo_b, hi_b = min(c[ib] for c in cs), max(c[ib] for c in cs)
    for loop in me.loops:
        c = me.vertices[loop.vertex_index].co
        u = (c[ia] - lo_a) / max(hi_a - lo_a, 1e-6)
        if axis == "X":
            u = 1 - u
        uv[loop.index].uv = (u, (c[ib] - lo_b) / max(hi_b - lo_b, 1e-6))


def set_origin(o, point):
    """Move the object origin to world point without moving the geometry."""
    p = Vector(point)
    o.data.transform(Matrix.Translation(-p))
    o.location = p


def join(objs, name):
    return lib.join(objs, name)


def empty(name, loc, size=0.25):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = Vector(loc)
    bpy.context.scene.collection.objects.link(e)
    return e


def check(name, max_tris, size_range=None, require_nodes=(), require_materials=(), ground=True):
    """lib.check, with an opt-out of the ground rule for hanging props (paper lantern)."""
    if ground:
        return lib.check(name, max_tris, size_range, require_nodes, require_materials)
    lo, hi = bounds()
    shift = Vector((0, 0, -lo.z))
    objs = [o for o in bpy.data.objects if o.parent is None]
    for o in objs:
        o.location += shift
    try:
        lib.check(name, max_tris, size_range, require_nodes, require_materials)
    finally:
        for o in objs:
            o.location -= shift


def framed_preview(name, out_dir, angles=(30, 120, 210), elevation=18, size=(900, 600)):
    """lib.preview with the camera distance fitted to the bounding sphere (tall props fit too)."""
    lo, hi = bounds()
    centre = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.3)
    scene = bpy.context.scene
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light, sh.color_type = "STUDIO", "MATERIAL"
    sh.show_cavity, sh.cavity_type = True, "BOTH"
    sh.show_object_outline, sh.object_outline_color = True, (0.05, 0.03, 0.08)
    sh.background_type, sh.background_color = "VIEWPORT", (0.36, 0.16, 0.43)
    scene.render.resolution_x, scene.render.resolution_y = size
    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("preview_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    vfov = 2 * math.atan(18 * size[1] / size[0] / 50)
    dist = radius / math.sin(vfov / 2) * 1.02
    files = []
    for a in angles:
        th, el = math.radians(a), math.radians(elevation)
        cam.location = centre + Vector((dist * math.cos(el) * math.sin(th), -dist * math.cos(el) * math.cos(th),
                                        dist * math.sin(el)))
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(out_dir, f"{name}_{a}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        files.append(path)
    bpy.data.objects.remove(cam)
    print(f"[preview] {files}")
    return files


def finish(name, max_tris, ground=True, **check_kw):
    """check + export + preview (preview skipped with --no-preview 1)."""
    a = args()
    check(name, max_tris, ground=ground, **check_kw)
    export(name, a["out"])
    if not a.get("no-preview"):
        angles = tuple(int(x) for x in a["angles"].split(",")) if a.get("angles") else (30, 120, 210)
        framed_preview(name, a["preview"], angles=angles, elevation=float(a.get("elevation", 18)))


def rng(seed):
    return random.Random(seed)

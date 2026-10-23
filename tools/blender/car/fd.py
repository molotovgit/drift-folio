"""Hero car "FD": an RX-7 FD3S-inspired drift coupe (no badges, no text).

Run:
  blender -b --factory-startup -P tools/blender/car/fd.py -- --out public/models --preview tools/blender/out

Layout (Blender): front faces -Y, +Z up, origin at ground centre between the axles.
Contract: top-level nodes body, wheel_fl, wheel_fr, wheel_rl, wheel_rr (wheel origin = hub,
axle along X). Body shell is lofted from keyframed cross-section parameters, the wheel
arches are boolean-cut, the greenhouse is a second loft.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402

from lib import add_mod, apply_mods, args, assign, bpy, clear, finish, join, mat, preview  # noqa: E402
from loft import box, catmull, lathe, loft, to_object, tracks  # noqa: E402

AXLE_F, AXLE_R, TRACK_X, HUB_Z = -1.2125, 1.2125, 0.73, 0.32
TYRE_R, TYRE_W = 0.32, 0.23
Y_FRONT, Y_REAR = -2.07, 2.21

clear()
M = {n: mat(n) for n in ("paint", "paint_shadow", "ink", "glass", "headlight", "taillight", "tyre", "rim")}
BODY_MATS = [M[n] for n in ("paint", "paint_shadow", "ink", "glass", "headlight", "taillight")]
PAINT, SHADOW, INK, GLASS, HEAD, TAIL = range(6)

# --------------------------------------------------------------------------- body shell
# Cross-section parameters keyed along the length (y). z* are heights, w*/x* half-widths.
BODY = tracks({
    "zb": [(-2.07, 0.29), (-2.03, 0.22), (-1.97, 0.18), (-1.85, 0.15), (-1.5, 0.13), (1.5, 0.13),
           (1.85, 0.18), (2.05, 0.27), (2.21, 0.36)],
    "wbot": [(-2.07, 0.30), (-2.0, 0.46), (-1.8, 0.56), (-1.5, 0.60), (1.6, 0.60), (2.0, 0.58), (2.21, 0.52)],
    "zs": [(-2.07, 0.31), (-2.0, 0.25), (-1.8, 0.22), (1.8, 0.22), (2.1, 0.30), (2.21, 0.38)],
    "ws": [(-2.07, 0.34), (-2.03, 0.47), (-1.97, 0.56), (-1.85, 0.66), (-1.6, 0.74), (-1.2, 0.77),
           (0, 0.765), (0.9, 0.78), (1.5, 0.80), (1.9, 0.78), (2.12, 0.74), (2.21, 0.66)],
    "zm": [(-2.07, 0.33), (-1.95, 0.38), (-1.6, 0.46), (-1.2, 0.50), (0, 0.48), (1.2, 0.55), (2.0, 0.58),
           (2.21, 0.60)],
    "wm": [(-2.07, 0.38), (-2.03, 0.54), (-1.97, 0.64), (-1.88, 0.72), (-1.7, 0.80), (-1.5, 0.85),
           (-1.2, 0.885), (-0.75, 0.855), (-0.2, 0.805), (0.3, 0.815), (0.8, 0.865), (1.2, 0.89),
           (1.7, 0.88), (2.05, 0.845), (2.15, 0.81), (2.21, 0.74)],
    "zbl": [(-2.07, 0.37), (-2.0, 0.45), (-1.85, 0.55), (-1.6, 0.63), (-1.4, 0.67), (-1.2, 0.70),
            (-0.8, 0.70), (-0.3, 0.72), (0.3, 0.74), (0.9, 0.80), (1.3, 0.84), (1.9, 0.86), (2.21, 0.83)],
    "wbl": [(-2.07, 0.34), (-2.02, 0.50), (-1.9, 0.63), (-1.7, 0.74), (-1.5, 0.79), (-1.2, 0.81),
            (-0.7, 0.80), (0, 0.78), (0.7, 0.80), (1.2, 0.83), (1.8, 0.82), (2.1, 0.78), (2.21, 0.70)],
    "zf": [(-2.07, 0.39), (-2.02, 0.45), (-1.9, 0.54), (-1.7, 0.64), (-1.5, 0.73), (-1.2, 0.79),
           (-0.8, 0.80), (-0.4, 0.80), (0.3, 0.81), (0.9, 0.87), (1.3, 0.92), (1.9, 0.95), (2.12, 0.94),
           (2.21, 0.90)],
    "xf": [(-2.07, 0.26), (-2.0, 0.40), (-1.85, 0.52), (-1.6, 0.58), (-1.0, 0.62), (0, 0.64), (1.2, 0.66),
           (2.0, 0.62), (2.21, 0.56)],
    "zd": [(-2.07, 0.37), (-2.02, 0.43), (-1.9, 0.50), (-1.7, 0.56), (-1.4, 0.61), (-1.2, 0.64),
           (-0.8, 0.70), (-0.45, 0.75), (0, 0.78), (0.9, 0.84), (1.3, 0.90), (1.8, 0.94), (2.12, 0.93),
           (2.21, 0.89)],
})


def lerp(a, b, t):
    return a + (b - a) * t


def body_half(y):
    p = BODY(y)
    ctrl = [
        (0.0, p["zb"]), (p["wbot"] * 0.5, p["zb"]), (p["wbot"], p["zb"] + 0.012),
        (p["ws"], p["zs"]),
        (lerp(p["ws"], p["wm"], 0.85), lerp(p["zs"], p["zm"], 0.5)),
        (p["wm"], p["zm"]),
        (lerp(p["wm"], p["wbl"], 0.45) + 0.012, lerp(p["zm"], p["zbl"], 0.5)),
        (p["wbl"], p["zbl"]),
        (lerp(p["wbl"], p["xf"], 0.5), lerp(p["zbl"], p["zf"], 0.8)),
        (p["xf"], p["zf"]),
        (p["xf"] * 0.55, lerp(p["zf"], p["zd"], 0.92)),  # hood sits low between the fender humps
        (0.0, p["zd"]),
    ]
    return catmull(ctrl, 2)


def surface_z(x, y):
    """Height of the upper body surface at (x, y), from the top half of the profile."""
    pts = body_half(y)
    i_max = max(range(len(pts)), key=lambda i: pts[i][0])
    top = pts[i_max:]  # x decreasing towards the centreline
    for (x0, z0), (x1, z1) in zip(top, top[1:]):
        if x1 <= x <= x0:
            return lerp(z0, z1, (x0 - x) / max(x0 - x1, 1e-6))
    return top[-1][1]


def front_y(x, z):
    """First station (from the nose) whose cross-section reaches half-width x at height z."""
    y = Y_FRONT
    while y < -1.5:
        pts = body_half(y)
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            if min(z0, z1) <= z <= max(z0, z1) and lerp(x0, x1, (z - z0) / ((z1 - z0) or 1e-6)) >= x:
                return y
        y += 0.005
    return y


def stations(y0, y1, n, bias=0.45):
    """Stations denser at both ends (cosine blend)."""
    out = []
    for i in range(n + 1):
        u = i / n
        s = (1 - bias) * u + bias * (0.5 - 0.5 * math.cos(math.pi * u))
        out.append(y0 + (y1 - y0) * s)
    return out


HALF_SEGS = 22  # segments per half profile (12 control points, Catmull-Rom x2)
SHADOW_K = 8    # lower body below control point 4 (between rocker and widest line) is two-tone


def body_material(c, i, j):
    if j == -1:  # nose / tail caps
        return PAINT
    k = j if j < HALF_SEGS else 2 * HALF_SEGS - 1 - j
    return SHADOW if k < SHADOW_K else PAINT


shell = loft("shell", stations(Y_FRONT, Y_REAR, 64), body_half, material_fn=body_material, mats=BODY_MATS)

# wheel arches: closed cylinders cut a proper well into the closed shell
for ay in (AXLE_F, AXLE_R):
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.36, depth=0.5, vertices=40,
                                            location=(sx * 0.85, ay, HUB_Z + 0.015),
                                            rotation=(0, math.pi / 2, 0))
        cutter = assign(bpy.context.object, M["ink"])
        mod = add_mod(shell, "BOOLEAN", operation="DIFFERENCE", object=cutter, solver="EXACT")
        mod.material_mode = "TRANSFER"
        apply_mods(shell)
        bpy.data.objects.remove(cutter)

# --------------------------------------------------------------------------- greenhouse
CABIN = tracks({
    "top": [(-0.56, 0.76), (-0.46, 0.84), (-0.3, 0.92), (-0.05, 1.04), (0.2, 1.15), (0.38, 1.20),
            (0.55, 1.215), (0.75, 1.19), (0.95, 1.13), (1.2, 1.05), (1.45, 0.99), (1.6, 0.965), (1.66, 0.93)],
    "sill": [(-0.56, 0.74), (-0.46, 0.79), (-0.2, 0.815), (0.4, 0.83), (0.9, 0.88), (1.3, 0.93), (1.66, 0.93)],
    "wb": [(-0.56, 0.60), (-0.4, 0.67), (0, 0.71), (0.6, 0.72), (1.0, 0.71), (1.35, 0.67), (1.66, 0.58)],
    "n": [(-0.56, 2.2), (0.0, 2.6), (1.0, 2.6), (1.66, 2.2)],
})


CABIN_K = 10  # superellipse segments per half


def cabin_half(y):
    p = CABIN(y)
    e = 2.0 / p["n"]
    pts = []
    for s in range(CABIN_K + 1):
        t = (math.pi / 2) * s / CABIN_K
        pts.append((p["wb"] * math.cos(t) ** e, p["sill"] + (p["top"] - p["sill"]) * math.sin(t) ** e))
    pts[-1] = (0.0, p["top"])
    # buried skirt so the glass sits into the body
    return [(p["wb"], p["sill"] - 0.10)] + pts


def cabin_material(c, i, j):
    """k: 0 = buried skirt, 1..CABIN_K from window sill up to the roof centreline."""
    k = j if j <= CABIN_K else 2 * CABIN_K + 1 - j
    side, corner = k <= 4, k == 5
    if k == 0:
        return PAINT
    if c.y < -0.30:  # cowl end: windshield only, sides are body
        return GLASS if k >= 6 else PAINT
    if c.y < 0.24:  # windshield + A-pillars + front of the side glass
        return PAINT if corner else GLASS
    if c.y < 0.80:  # roof and gutters
        return GLASS if side else PAINT
    if c.y < 0.93:  # quarter glass tapers into the C-pillar
        return GLASS if k <= 3 else PAINT
    if c.y < 1.16:  # C-pillars, start of the wraparound hatch glass
        return PAINT if (side or corner) else GLASS
    return GLASS if k >= 3 else PAINT


cabin = loft("cabin", stations(-0.56, 1.66, 40, 0.3), cabin_half, closed=False, cap=False,
             material_fn=cabin_material, mats=BODY_MATS)

for ob in (shell, cabin):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))

# --------------------------------------------------------------------------- details
bm = bmesh.new()


def part(centre, size, mi, rot_x=0.0):
    return box(bm, centre, size, mi, rot_x)


def rot_verts(faces, angle, axis, centre):
    vs = list({v for f in faces for v in f.verts})
    bmesh.ops.rotate(bm, verts=vs, cent=centre, matrix=Matrix.Rotation(angle, 3, axis))


def cyl_y(x, y, z, r, depth, mi, sx=1.0, sz=1.0, segs=16):
    """Disc / short cylinder along Y (lamps, mouth)."""
    prof = [(-depth / 2, 0.0), (-depth / 2, r), (depth / 2, r), (depth / 2, 0.0)]
    faces = lathe(bm, prof, segs, mi)
    vs = list({v for f in faces for v in f.verts})
    bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Z"))
    bmesh.ops.scale(bm, verts=vs, vec=(sx, 1, sz))
    bmesh.ops.translate(bm, verts=vs, vec=(x, y, z))
    return faces


for sx in (-1, 1):
    # pop-up headlights, raised: paint pod with a glowing lens facing forward
    hx, hy = sx * 0.565, -1.60
    hz = surface_z(abs(hx), hy)
    part((hx, hy, hz + 0.065), (0.38, 0.17, 0.16), PAINT, rot_x=-0.08)
    part((hx, hy - 0.087, hz + 0.07), (0.33, 0.02, 0.11), HEAD, rot_x=-0.08)
    part((hx, hy + 0.02, hz + 0.152), (0.39, 0.19, 0.012), INK, rot_x=-0.08)  # pod lid seam
    part((hx, hy + 0.01, hz - 0.005), (0.35, 0.16, 0.04), INK)  # hinge gap under the pod
    # mirrors
    part((sx * 0.76, -0.30, 0.895), (0.14, 0.04, 0.025), INK)
    part((sx * 0.86, -0.30, 0.925), (0.10, 0.07, 0.075), INK)
    # side skirts
    part((sx * 0.775, 0.0, 0.17), (0.06, 1.66, 0.07), SHADOW)
    # front fender vents behind the front wheel
    for k in range(3):
        f = part((sx * 0.872, -0.70 + k * 0.055, 0.56 - k * 0.01), (0.012, 0.025, 0.12), INK, rot_x=0.35)
    # tail lights: two round lamps per side on a black band
    for lx in (0.40, 0.60):
        cyl_y(sx * lx, 2.228, 0.745, 0.068, 0.03, TAIL)
    # wing endplates and stands
    part((sx * 0.84, 1.99, 1.13), (0.018, 0.32, 0.13), INK)
    part((sx * 0.40, 2.0, 1.05), (0.02, 0.08, 0.24), INK)
    # exhaust
    cyl_y(sx * 0.30, 2.18, 0.33, 0.045, 0.14, INK, segs=12)

part((0, 2.205, 0.745), (1.30, 0.04, 0.17), INK)        # tail light band
part((0, -1.05, surface_z(0.0, -1.05) + 0.004), (0.30, 0.14, 0.03), INK, rot_x=0.12)  # hood vent
part((0, 1.99, 1.175), (1.66, 0.30, 0.035), PAINT, rot_x=-0.07)  # full width wing
part((0, 1.88, 1.19), (1.66, 0.05, 0.02), INK, rot_x=-0.07)   # wing leading edge trim
part((0, -1.84, 0.145), (1.20, 0.20, 0.022), INK)        # front splitter
part((0, 2.02, 0.24), (1.00, 0.24, 0.04), INK)           # rear diffuser
cyl_y(0, front_y(0.0, 0.29) + 0.03, 0.29, 0.26, 0.12, INK, sx=1.35, sz=0.21, segs=24)  # oval intake mouth
for sx in (-1, 1):  # bumper driving lamps either side of the mouth
    y_in, y_out = front_y(0.43, 0.31), front_y(0.57, 0.31)
    part((sx * 0.50, (y_in + y_out) / 2, 0.31), (0.14, y_out - y_in + 0.03, 0.05), HEAD)

details = to_object(bm, "details", BODY_MATS)
for p in details.data.polygons:
    p.use_smooth = False

body = join([shell, cabin, details], "body")

# --------------------------------------------------------------------------- wheels
TYRE = [(-0.112, 0.215), (-0.117, 0.27), (-0.108, 0.303), (-0.085, 0.32), (0.085, 0.32),
        (0.108, 0.303), (0.117, 0.27), (0.112, 0.215)]
RIM = [(0.112, 0.216), (0.098, 0.208), (0.035, 0.200), (0.040, 0.075), (0.070, 0.055), (0.078, 0.0)]


def make_wheel(name, x, y):
    wb = bmesh.new()
    lathe(wb, TYRE, 32, 0)
    lathe(wb, RIM, 32, 1)
    for k in range(5):
        fs = box(wb, (0.055, 0.0, 0.135), (0.03, 0.04, 0.15), 1)
        vs = list({v for f in fs for v in f.verts})
        bmesh.ops.rotate(wb, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(2 * math.pi * k / 5, 3, "X"))
    if x < 0:  # outer face points away from the car
        bmesh.ops.rotate(wb, verts=wb.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, "Z"))
    bmesh.ops.recalc_face_normals(wb, faces=wb.faces)
    ob = to_object(wb, name, [M["tyre"], M["rim"]])
    ob.location = (x, y, HUB_Z)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    return ob


for nm, wx, wy in (("wheel_fl", -TRACK_X, AXLE_F), ("wheel_fr", TRACK_X, AXLE_F),
                   ("wheel_rl", -TRACK_X, AXLE_R), ("wheel_rr", TRACK_X, AXLE_R)):
    make_wheel(nm, wx, wy)

finish("fd", 25000, size_range=((1.6, 4.0, 1.0), (1.95, 4.6, 1.45)),
       require_nodes=("body", "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"),
       require_materials=("paint", "glass", "headlight", "taillight", "tyre", "rim"))
out = args()["preview"]
preview("fd_hero", out, angles=(35,), elevation=6)
preview("fd_view", out, angles=(0, 90, 180), elevation=2)

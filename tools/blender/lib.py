"""Shared helpers for Drift Folio asset scripts.

Run any asset script headless:
  blender -b --factory-startup -P tools/blender/props/torii.py -- --out public/models --preview tools/blender/out

Conventions (all scripts):
  * Units are metres, Blender +Z is up. glTF export converts to +Y up.
  * Things with a "front" (car, vending machine, billboard) face Blender -Y,
    which becomes glTF +Z, the game's forward axis.
  * Origin sits at the ground contact point (base centre).
  * Materials are flat base colours from PALETTE; toon shading happens in the game.
    Material names are part of the contract with the game code, keep them stable.
"""
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

PALETTE = {
    "paint": "#2fb8a8",
    "paint_shadow": "#3a3a7a",
    "ink": "#1a1420",
    "glass": "#2a2440",
    "rim": "#1f1b26",
    "tyre": "#17141c",
    "headlight": "#dff6ff",
    "taillight": "#ff3050",
    "lamp_glow": "#ffb35a",
    "metal": "#cfc6d8",
    "metal_dark": "#5a5266",
    "torii": "#c8321f",
    "wood": "#6a3e2e",
    "wood_light": "#a0683e",
    "roof": "#3a2a4a",
    "wall": "#e8d9c0",
    "wall_warm": "#d8a878",
    "concrete": "#8a7a92",
    "foliage_red": "#b8322c",
    "foliage_orange": "#e0572e",
    "foliage_amber": "#f08a3c",
    "pine": "#3b2f5a",
    "trunk": "#4a2c2a",
    "rock": "#6b5a72",
    "cone": "#ff6a2a",
    "white": "#f4efe6",
    "vending_blue": "#2f6fd8",
    "vending_red": "#d8323a",
    "screen": "#9fe8ff",
    "paper_lantern": "#ffcf7a",
    "sign_green": "#2f8a5a",
}

EMISSIVE = {"headlight": 4.0, "taillight": 2.5, "lamp_glow": 6.0, "screen": 2.0, "paper_lantern": 3.0}


def args():
    """Parse '-- --out DIR --preview DIR' style args. Returns dict."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"out": "public/models", "preview": "tools/blender/out"}
    for i, a in enumerate(argv):
        if a.startswith("--") and i + 1 < len(argv):
            out[a[2:]] = argv[i + 1]
    return out


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.objects, bpy.data.curves):
        for block in list(coll):
            coll.remove(block)


def hex_rgba(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def mat(name, hex_color=None, emissive=None, roughness=0.8, metallic=0.0):
    """Get or create a flat material. Name doubles as the game contract key."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    hex_color = hex_color or PALETTE.get(name, "#ff00ff")
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    rgba = hex_rgba(hex_color)
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    strength = emissive if emissive is not None else EMISSIVE.get(name, 0.0)
    if strength > 0:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = rgba  # workbench preview colour
    return m


def assign(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def add_mod(obj, kind, **kw):
    m = obj.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    return m


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def join(objs, name):
    """Join objects into one mesh (keeps per-face materials)."""
    objs = [o for o in objs if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        apply_mods(o)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o


def shade_flat(obj):
    for p in obj.data.polygons:
        p.use_smooth = False


def tri_count(objs=None):
    objs = objs or [o for o in bpy.data.objects if o.type == "MESH"]
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in objs:
        me = o.evaluated_get(dg).to_mesh()
        total += sum(len(p.vertices) - 2 for p in me.polygons)
        o.evaluated_get(dg).to_mesh_clear()
    return total


def bounds(objs=None):
    objs = objs or [o for o in bpy.data.objects if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def check(name, max_tris, size_range=None, require_nodes=(), require_materials=()):
    """Assert asset contract; prints a one-line report and raises on failure."""
    t = tri_count()
    lo, hi = bounds()
    size = hi - lo
    problems = []
    if t > max_tris:
        problems.append(f"tris {t} > {max_tris}")
    if abs(lo.z) > 0.05:
        problems.append(f"base not on ground (min z {lo.z:.2f})")
    if size_range:
        (mn, mx) = size_range
        if not all(mn[i] <= size[i] <= mx[i] for i in range(3)):
            problems.append(f"size {tuple(round(s, 2) for s in size)} outside {size_range}")
    names = {o.name for o in bpy.data.objects}
    for n in require_nodes:
        if n not in names:
            problems.append(f"missing node {n}")
    mats = {m.name for m in bpy.data.materials if m.users}
    for n in require_materials:
        if n not in mats:
            problems.append(f"missing material {n}")
    print(f"[check] {name}: tris={t} size={tuple(round(s, 2) for s in size)} problems={problems or 'none'}")
    if problems:
        raise SystemExit(f"asset check failed for {name}: {problems}")


def export(name, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    print(f"[export] {path} {os.path.getsize(path) // 1024} KB")
    return path


def preview(name, out_dir, angles=(30, 120, 210), elevation=18, size=(900, 600)):
    """Render workbench previews with outlines, on a dusk background."""
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_cavity = True
    sh.cavity_type = "BOTH"
    sh.show_object_outline = True
    sh.object_outline_color = (0.05, 0.03, 0.08)
    sh.background_type = "VIEWPORT"
    sh.background_color = (0.36, 0.16, 0.43)
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    lo, hi = bounds()
    centre = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.5)
    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("preview_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    files = []
    for a in angles:
        r = radius * 3.2
        th, el = math.radians(a), math.radians(elevation)
        cam.location = centre + Vector((r * math.cos(el) * math.sin(th), -r * math.cos(el) * math.cos(th), r * math.sin(el)))
        direction = centre - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(out_dir, f"{name}_{a}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        files.append(path)
    bpy.data.objects.remove(cam)
    print(f"[preview] {files}")
    return files


def finish(name, max_tris, **check_kw):
    """Standard tail of every asset script: check, export, preview."""
    a = args()
    check(name, max_tris, **check_kw)
    export(name, a["out"])
    preview(name, a["preview"])


# re-exported for scripts
__all__ = [
    "PALETTE", "args", "clear", "mat", "assign", "add_mod", "apply_mods", "join", "shade_flat",
    "tri_count", "bounds", "check", "export", "preview", "finish", "bmesh", "Vector", "math", "bpy",
]

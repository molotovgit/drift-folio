"""Torii gate at the summit. Spans an 8 m road: pillars 9 m apart, 6.4 m tall."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib import add_mod, assign, bpy, clear, finish, join, mat  # noqa: E402

clear()
red, ink = mat("torii"), mat("ink")
parts = []

for x in (-4.5, 4.5):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=5.9, location=(x, 0, 2.95), vertices=12)
    pillar = assign(bpy.context.object, red)
    pillar.scale = (1, 1, 1)
    parts.append(pillar)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.42, depth=0.5, location=(x, 0, 0.25), vertices=12)
    parts.append(assign(bpy.context.object, ink))  # kamaki base ring

# nuki: lower tie beam, passes through pillars
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 4.7))
nuki = assign(bpy.context.object, red)
nuki.scale = (5.6, 0.22, 0.2)
parts.append(nuki)

# shimaki + kasagi: top beams, kasagi black with upturned ends
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 5.75))
shimaki = assign(bpy.context.object, red)
shimaki.scale = (5.9, 0.34, 0.2)
parts.append(shimaki)

bpy.ops.mesh.primitive_cube_add(location=(0, 0, 6.15))
kasagi = assign(bpy.context.object, ink)
kasagi.scale = (6.4, 0.42, 0.2)
add_mod(kasagi, "SIMPLE_DEFORM", deform_method="BEND", angle=-0.35, deform_axis="Y")
parts.append(kasagi)

# gakuzuka: centre strut with a name plaque
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 5.22))
strut = assign(bpy.context.object, red)
strut.scale = (0.22, 0.2, 0.36)
parts.append(strut)
bpy.ops.mesh.primitive_cube_add(location=(0, -0.24, 5.22))
plaque = assign(bpy.context.object, ink)
plaque.scale = (0.45, 0.04, 0.32)
parts.append(plaque)

for p in parts:
    bpy.context.view_layer.objects.active = p
    bpy.ops.object.transform_apply(scale=True)
join(parts, "torii")
finish("torii", 1500, size_range=((9, 0.5, 6), (14, 1.5, 7.5)), require_materials=("torii", "ink"))

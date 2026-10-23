# Drift Folio environment props

Every model below was made from scratch for this project by Blender Python scripts in
`tools/blender/props/`. There are no third-party models, textures, scans or kitbash parts.
All geometry is procedural: primitives, lathes, sweeps and hulls from `tools/blender/proplib.py`,
with flat palette materials from `tools/blender/lib.py`.

## Building

```
python tools/blender/build_all.py                 # every prop -> public/models/*.glb, previews -> tools/blender/out/
python tools/blender/build_all.py torii lamp      # just these scripts
python tools/blender/build_all.py --no-preview    # skip the workbench renders
```

Each script runs the asset contract check (triangle budget, base on the ground, size range,
required nodes and materials) before it exports. If any check fails, `build_all.py` exits non-zero.

## Conventions

The units are metres. Blender +Z is up, and the glTF export turns it into +Y up. Props with a
front face Blender −Y, which is glTF +Z. The origin sits at the base centre on the ground.
`paper_lantern` is the one exception: its origin is the top hook.
Material names are the contract with the game. New palette keys were appended to `lib.py`:
`stone`, `hazard_yellow`, `noren`, `tunnel_dark`, `loco_red`, `container_teal`,
`container_rust` and `aluminium`.

## Asset list

| Asset (glb) | Script | Tris / budget | Size X×Y×Z (m) | Nodes the game relies on |
|---|---|---|---|---|
| torii | torii.py | 460 / 1500 | 11.7 × 0.9 × 7.1 | `torii` |
| tree_maple_0 | tree_maple.py | 1270 / 1800 | 8.7 × 7.0 × 8.5 | `tree_maple_0` (red, some orange) |
| tree_maple_1 | tree_maple.py | 1002 / 1800 | 5.9 × 6.9 × 7.0 | `tree_maple_1` (orange) |
| tree_maple_2 | tree_maple.py | 1538 / 1800 | 9.4 × 9.5 × 10.5 | `tree_maple_2` (amber + orange) |
| tree_maple_3 | tree_maple.py | 1002 / 1800 | 5.5 × 5.4 × 6.2 | `tree_maple_3` (red + orange) |
| tree_pine_0 | tree_pine.py | 332 / 900 | 6.3 × 6.1 × 11.0 | `tree_pine_0` |
| tree_pine_1 | tree_pine.py | 436 / 900 | 6.6 × 6.9 × 14.0 | `tree_pine_1` |
| tree_pine_2 | tree_pine.py | 280 / 900 | 5.5 × 4.8 × 9.0 | `tree_pine_2` |
| lamp | lamp.py | 364 / 600 | 4.1 × 0.6 × 7.2 | `lamp`, empty `light_anchor` (bulb, arm reaches −X) |
| power_pole | power_pole.py | 366 / 400 | 2.5 × 1.0 × 10.0 | `power_pole`, empties `wire_l`, `wire_c`, `wire_r` (wires run along ±Y) |
| vending_machine_blue | vending_machine.py | 452 / 500 | 1.0 × 0.86 × 1.85 | `vending_machine_blue` (`vending_blue`, `screen`) |
| vending_machine_red | vending_machine.py | 452 / 500 | 1.0 × 0.86 × 1.85 | `vending_machine_red` (`vending_red`, `screen`) |
| shrine | shrine.py | 1216 / 2500 | 2.5 × 2.6 × 3.15 | `shrine` (lantern uses `paper_lantern`) |
| garage | garage.py | 1476 / 2500 | 12.5 × 10.4 × 5.0 | `garage`, `pit_wall` (separate mesh, material `wall`, UV 0..1, faces −Y, 10.6 × 3 m) |
| tea_house | tea_house.py | 1546 / 2500 | 8.0 × 6.8 × 4.7 | `tea_house` (`noren`, `paper_lantern`) |
| house_0 | house.py | 912 / 1500 | 7.1 × 6.6 × 5.2 | `house_0` |
| house_1 | house.py | 532 / 1500 | 7.1 × 5.6 × 5.1 | `house_1` |
| billboard | billboard.py | 232 / 400 | 4.3 × 1.1 × 4.5 | `billboard`, `panel` (4 × 2.4 m, material `white`, UV 0..1, u = +X, v = up on the −Y face) |
| signpost | signpost.py | 204 / 400 | 2.8 × 0.9 × 3.4 | `signpost`, `sign_0` (points −X), `sign_1` (+X), `sign_2` (back-left); each `sign_green`, UV 0..1 on its front, origin on the pole axis |
| cone | cone.py | 186 / 200 | 0.4 × 0.4 × 0.7 | `cone` (`cone` + `white`) |
| tyre | tyre.py | 286 / 300 | 0.64 × 0.64 × 0.23 | `tyre` |
| train_loco | train.py | 1516 / 3000 | 2.95 × 14.4 × 4.3 | `train_loco` (front −Y, `headlight` front, `taillight` rear) |
| train_wagon | train.py | 1352 / 1500 | 2.6 × 16.5 × 3.6 | `train_wagon` |
| crossing_barrier | crossing_barrier.py | 588 / 600 | 7.2 × 0.5 × 3.5 | `crossing_barrier`, `boom` (origin = hinge at (−0.42, 0, 1.15) Blender; modelled lowered along −X; to raise it, rotate about Blender +Y = glTF −Z), lights `taillight` |
| paper_lantern | paper_lantern.py | 276 / 300 | 0.36 × 0.36 × 0.61 | `paper_lantern` (origin at the top hook, hangs to −Z) |
| rock_0 | rock.py | 80 / 300 | 1.2 × 1.1 × 0.7 | `rock_0` |
| rock_1 | rock.py | 80 / 300 | 2.7 × 1.9 × 0.9 | `rock_1` |
| rock_2 | rock.py | 160 / 300 | 3.7 × 3.1 × 1.7 | `rock_2` |
| fence_segment | fence_segment.py | 84 / 300 | 3.0 × 0.16 × 1.1 | `post_0..2`, `rail_0..2`, each a separate node with its origin at its own centre, so the game can break them apart |
| ramp | ramp.py | 252 / 300 | 4.0 × 6.0 × 1.4 | `ramp` (entry edge at +Y, lip at −Y, so cars jump driving along glTF +Z) |
| tunnel_portal | tunnel_portal.py | 356 / 1500 | 12.4 × 20.7 × 8.4 | `tunnel_portal` (face at y = 0, bore 9 × 6 m into +Y), `tunnel_inner` (`tunnel_dark`, 20 m) |
| mac_mini | mac_mini.py | 200 / 200 | 1.2 × 1.2 × 0.3 | `mac_mini` (`aluminium`, no logos) |

Total: 32 files, about 1.2 MB of glb.

## Notes

- The two-file and multi-variant assets (trees, rocks, houses, vending machines, trains) each
  come from one script that clears the scene, then checks, exports and previews each variant in turn.
- The torii kasagi is loop-cut along its length (14 cuts) and then bent into a true arc. The ends
  rise about 0.45 m. The pillars are 9 m apart and the kasagi is about 11.5 m long.
- Previews are workbench renders with outlines, written to `tools/blender/out/` (git-ignored).
  To get extra views, add `--angles 0,330 --elevation 8` to `build_all.py`.

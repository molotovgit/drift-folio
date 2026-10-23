# Drift Folio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable drift-car 3D portfolio at https://amirbek.is-a.dev that matches the user's Inertial Drift style reference.

**Architecture:** Static Vite + TypeScript site. Three.js `WebGPURenderer` (auto WebGL2 fallback) with TSL toon materials and a post-processing chain for outlines, bloom, grading and motion blur. Rapier runs a custom raycast drift vehicle on a procedurally generated mountain whose roads come from one road-network data file. Gameplay rules (drift detection, scoring, triggers) are pure TypeScript modules with unit tests; rendering and physics glue are verified by Playwright smoke and screenshot checks.

**Tech Stack:** three (≥ r171, `three/webgpu` + `three/tsl`), @dimforge/rapier3d-compat, Vite, TypeScript (strict), Vitest, Playwright, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-23-drift-folio-design.md` (style ref `drift-folio-style-ref.png` beside it).

## How this plan is shaped

The spec spans eleven subsystems. Splitting it into eleven separate plans would hide the order they must land in, so this is one roadmap of milestones. Each milestone is one branch and one PR, and each produces a deployable, playable build.

- **M0 and M1 are written at step level** and can be executed as-is.
- **M2 to M10 are written at task level**: files, interfaces, and the tests that prove each task. Before starting each of these milestones, expand it to step level with superpowers:writing-plans, because what we learn in M1 (feel) and M2 (look) will change their details.
- **Two user gates** stop the line: the *fun gate* after M1 and the *style gate* after M2. Nothing past them starts until the user signs off.

## Global Constraints

- All commits, PRs and deploys as molotovgit (`user.name=molotovgit`, noreply email). No other identity or token.
- Every PR reviewed with superpowers:requesting-code-review; Critical and Important findings fixed and pushed before merge (superpowers:receiving-code-review).
- Repo `molotovgit/drift-folio`, public, default branch `main`.
- Domain `amirbek.is-a.dev`; Pages CNAME file contains exactly `amirbek.is-a.dev`.
- No Mazda logos, badges or the word "Mazda" in assets or UI. The car is called "FD".
- Audio and any third-party asset: CC0 or self-made only; record source in `ASSETS.md`.
- Budgets: initial payload ≤ 15 MB; first interactive frame ≤ 8 s at 20 Mbps; 60 fps on a 2020 mid laptop; 30 fps on a 2022 mid phone.
- Drift threshold |β| ≥ 12° and speed ≥ 8 m/s. Score per frame `|β|° × speed × dt × multiplier`. Multiplier +1 per drift started within 1.5 s of the last, cap ×5. Bank after 2.0 s without drift. Off-road for > 1.0 s (except S2) or rail impact above threshold = crash.
- Summit 0 m, town −120 m, each descent 600–1000 m (was 900; raised in M3, see spec §6).
- Files under 500 lines (project CLAUDE.md).
- Physics step fixed at 1/60 s; frame dt clamped to ≤ 1/30 s before accumulation.

## Review Focus

1. **Tab switch or long frame:** returning to a background tab must not teleport the car or add a giant score; dt is clamped and fixed-step accumulates (test in M1 Task 1.3, M4 Task 4.1).
2. **Car stuck or fallen out of the world:** below −200 m or speed < 0.5 m/s off-road for 4 s auto-resets to last checkpoint; R always works (test in M3 Task 3.4).
3. **No WebGPU, no WebGL2, or context lost:** WebGL2 fallback is silent; with neither, or on context loss that does not restore in 3 s, the skip overlay opens (test in M0 Task 0.2, M9 Task 9.3).
4. **Storage blocked (Safari private, iframes):** every localStorage access wrapped; scores and unlocks keep working in memory for the session (test in M4 Task 4.3).
5. **Phone portrait, resize, high DPR:** canvas follows container size, DPR capped at 2 (1.5 on phones), touch controls never scroll or zoom the page (test in M9 Task 9.1).

## File structure

```
drift-folio/
  index.html                  canvas, HUD root, skip link
  src/main.ts                 boot: capability check → engine → world → game loop
  src/core/engine.ts          renderer, resize, DPR cap, render loop, context loss
  src/core/loop.ts            fixed-step accumulator (pure)
  src/core/input.ts           keyboard + gamepad → ControlState
  src/vehicle/driftMath.ts    slip angle, grip curve, assists (pure)
  src/vehicle/driftCar.ts     Rapier raycast vehicle using driftMath
  src/vehicle/carConfig.ts    FD tuning values
  src/camera/chaseCamera.ts   velocity-following chase cam + top-down toggle
  src/render/palette.ts       colour tokens from spec §5
  src/render/toon.ts          TSL toon material factory
  src/render/post.ts          outline, bloom, grade, motion blur chain
  src/fx/smoke.ts  src/fx/skids.ts  src/fx/leaves.ts
  src/world/roadNetwork.ts    nodes, edges, splines, route ids (pure data + queries)
  src/world/terrain.ts        heightfield shaped around the road network
  src/world/roadMesh.ts       extruded road, rails, collision
  src/world/props/*.ts        torii, lamps, trees, tunnel, rail, town buildings
  src/world/checkpoints.ts    reset points, stuck detection (pure)
  src/game/driftScore.ts      MW scoring state machine (pure)
  src/game/routeRun.ts        run timing, route best, persistence
  src/game/triggers.ts        apex + zone triggers (pure geometry)
  src/content/projects.ts     nine cards, about, skills, links
  src/ui/hud.ts  src/ui/card.ts  src/ui/skip.ts  src/ui/touch.ts
  src/secrets/*.ts            shortcuts S1–S6, ghost, easter eggs
  src/audio/*.ts              engine, tyres, ambience
  src/util/storage.ts         safe localStorage wrapper
  tests/unit/*.test.ts        Vitest
  tests/e2e/*.spec.ts         Playwright
  public/models  public/audio  public/CNAME
  .github/workflows/deploy.yml
```

---

## M0 · Foundation and live deploy

Outcome: an empty dusk-coloured scene with a spinning placeholder cube is live at `https://molotovgit.github.io/drift-folio/`, deployed by CI.

### Task 0.1: Prerequisites (user + account)

- [ ] **Step 1:** Ask the user to approve the `workflow` scope: run `gh auth refresh -h github.com -s workflow` and give them the device code. Verify with `gh auth status` showing `workflow` in scopes.
- [ ] **Step 2:** Create the repo: `gh repo create molotovgit/drift-folio --public --description "Drift down a mountain to see my work" --clone` in `D:\Claude_tmp\`.
- [ ] **Step 3:** Copy `docs/superpowers/specs/*` and this plan into the repo's `docs/superpowers/`. Commit `docs: design and plan` on `main` (the only direct-to-main commit).

### Task 0.2: Scaffold, engine and capability check

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/core/engine.ts`, `src/render/palette.ts`, `src/ui/skip.ts`, `src/content/projects.ts`
- Test: `tests/unit/capability.test.ts`, `tests/e2e/boot.spec.ts`

**Interfaces:**
- Produces: `type GpuTier = 'webgpu' | 'webgl2' | 'none'`; `detectGpu(nav: Navigator, canvas: HTMLCanvasElement): Promise<GpuTier>`; `createEngine(canvas): Promise<Engine>` with `Engine { renderer, scene, camera, onFrame(cb: (dt: number) => void): void, dispose(): void }`; `openSkipOverlay(reason: 'user' | 'no-gpu' | 'slow' | 'context-lost'): void`; `palette` object with the hex values from spec §5.
- Produces: `projects: ProjectCard[]` where `ProjectCard { id: 'C1'…'C9'; title: string; blurb: string; stack: string[]; repos: string[]; public: boolean; url?: string; route: RouteId }` and `RouteId = 'automation' | 'platform' | 'systems' | 'systems-branch'`.

- [ ] **Step 1:** `npm create vite@latest . -- --template vanilla-ts`, then add `three @dimforge/rapier3d-compat` and dev deps `vitest @playwright/test @types/three`. Pin exact versions in `package.json`. Set `base: '/'` when `CUSTOM_DOMAIN=1`, else `'/drift-folio/'`.
- [ ] **Step 2: Write the failing test** `tests/unit/capability.test.ts`:

```ts
it('prefers webgpu when an adapter is returned', async () => {
  const nav = { gpu: { requestAdapter: async () => ({}) } } as any
  expect(await detectGpu(nav, fakeCanvas({ webgl2: true }))).toBe('webgpu')
})
it('falls back to webgl2 when requestAdapter returns null', async () => {
  const nav = { gpu: { requestAdapter: async () => null } } as any
  expect(await detectGpu(nav, fakeCanvas({ webgl2: true }))).toBe('webgl2')
})
it('returns none when neither is available', async () => {
  expect(await detectGpu({} as any, fakeCanvas({ webgl2: false }))).toBe('none')
})
```

- [ ] **Step 3:** Run `npx vitest run tests/unit/capability.test.ts`. Expected: FAIL, `detectGpu` not defined.
- [ ] **Step 4:** Implement `detectGpu` in `src/core/engine.ts`, then `createEngine` using `WebGPURenderer` from `three/webgpu` (it falls back to WebGL2 itself; we only need `detectGpu` to decide `'none'`). Background = sky gradient from `palette`. DPR cap 2. `src/ui/skip.ts` renders the overlay from `projects`. Fill `src/content/projects.ts` with the nine cards from spec §7.
- [ ] **Step 5:** Run unit tests. Expected: 3 PASS.
- [ ] **Step 6: Write e2e** `tests/e2e/boot.spec.ts`: page loads with no console errors; `canvas` is visible; clicking "Skip the game" shows 9 `.card` elements; with `--disable-gpu --disable-webgl` launch args the overlay opens by itself.
- [ ] **Step 7:** `npx playwright test`. Expected: all PASS.
- [ ] **Step 8:** Commit `feat: engine boot, capability check, skip overlay`.

### Task 0.3: CI deploy

> **Deviation (2026-10-23):** the account token lacks the `workflow` scope, so there is no `ci.yml` or `deploy.yml` for now. Every PR runs `npm run verify` (build + vitest + playwright) locally before review, and `npm run deploy` publishes `dist` to the `gh-pages` branch. Vite uses `base: './'`, so runtime asset URLs must be relative (`models/fd.glb`, never `/models/...`). Switch to Actions once the scope is granted.

**Files:** Create `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`.

- [ ] **Step 1:** `ci.yml` on pull_request: `npm ci`, `npx tsc --noEmit`, `npx vitest run`, `npx playwright install --with-deps chromium`, `npx playwright test`.
- [ ] **Step 2:** `deploy.yml` on push to `main`: build, upload `dist` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`.
- [ ] **Step 3:** Enable Pages: `gh api repos/molotovgit/drift-folio/pages -X POST -f build_type=workflow`.
- [ ] **Step 4:** Open PR `M0 foundation`, run superpowers review, fix findings, merge. Verify `curl -I https://molotovgit.github.io/drift-folio/` returns 200.

---

## M1 · Drift grey-box (ends at the FUN GATE)

Outcome: a box car on a flat grey plane with cones, drifting with handbrake and counter-steer, followed by a chase camera. No art.

### Task 1.1: Drift maths

**Files:** Create `src/vehicle/driftMath.ts`. Test `tests/unit/driftMath.test.ts`.

**Interfaces:**
- Produces: `slipAngleDeg(heading: Vec2, velocity: Vec2): number` (signed, −180..180, 0 when speed < 0.5 m/s); `isDrifting(slipDeg: number, speed: number): boolean`; `lateralGrip(slipRad: number, peakRad: number, slideFactor: number): number` (normalised 0..1); `rearGripScale(c: { handbrake: boolean; clutchKickT: number; throttle: number; speed: number }): number`; `counterSteerAssist(slipDeg: number, steerInput: number, strength: number): number` (returns steer −1..1).

- [ ] **Step 1: Write the failing tests:**

```ts
expect(slipAngleDeg({x:1,y:0}, {x:Math.cos(r(30)), y:Math.sin(r(30))})).toBeCloseTo(30, 1)
expect(slipAngleDeg({x:1,y:0}, {x:0.1,y:0.1})).toBe(0)          // below 0.5 m/s
expect(isDrifting(12, 8)).toBe(true)
expect(isDrifting(11.9, 20)).toBe(false)
expect(isDrifting(30, 7.9)).toBe(false)
expect(lateralGrip(0, r(8), 0.7)).toBe(0)
expect(lateralGrip(r(8), r(8), 0.7)).toBeCloseTo(1)
expect(lateralGrip(r(40), r(8), 0.7)).toBeCloseTo(0.7, 1)        // plateau when sliding
expect(rearGripScale({ handbrake: true, clutchKickT: 0, throttle: 0, speed: 20 })).toBeCloseTo(0.35)
expect(rearGripScale({ handbrake: false, clutchKickT: 0, throttle: 0, speed: 20 })).toBe(1)
expect(rearGripScale({ handbrake: false, clutchKickT: 0.2, throttle: 1, speed: 20 })).toBeLessThan(0.6)
expect(Math.sign(counterSteerAssist(25, 0, 0.6))).toBe(-1)      // steers into the slide
expect(counterSteerAssist(5, 0.4, 0.6)).toBe(0.4)                // no assist below 12°
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/driftMath.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Grip curve: rises as `sin` to the peak, eases down to `slideFactor`. Handbrake scale 0.35. Clutch kick drops rear grip to 0.5 for 0.3 s scaled by throttle. Assist adds `−sign(β) × strength × min(1, (|β|−12)/30)` and clamps.
- [ ] **Step 4:** Run tests. Expected: PASS. Commit `feat: drift maths`.

### Task 1.2: Input

**Files:** Create `src/core/input.ts`. Test `tests/unit/input.test.ts`.

**Interfaces:** Produces `ControlState { throttle: number; brake: number; steer: number; handbrake: boolean; clutch: boolean; reset: boolean; camera: boolean; horn: boolean }` and `createInput(target: EventTarget): { read(): ControlState; dispose(): void }`.

- [ ] **Step 1:** Tests: pressing `KeyW` gives throttle 1; `ArrowLeft` gives steer −1; `Space` gives handbrake true; releasing all keys returns zeros; keyboard steer ramps over 0.12 s rather than snapping (read at 0.06 s ≈ 0.5); window `blur` clears all keys.
- [ ] **Step 2:** Run, expect FAIL. Implement keyboard + Gamepad API (standard mapping, axes 0 steer, triggers 7/6 gas/brake, button 0 handbrake). Run, expect PASS. Commit `feat: input`.

### Task 1.3: Fixed-step loop and physics world

**Files:** Create `src/core/loop.ts`, `src/vehicle/carConfig.ts`, `src/vehicle/driftCar.ts`. Test `tests/unit/loop.test.ts`, `tests/e2e/drive.spec.ts`.

**Interfaces:**
- Produces: `createFixedLoop(step: number, maxFrame: number, tick: (h: number) => void): { advance(frameDt: number): number /* alpha */ }`.
- Produces: `carConfig` with FD values: mass 1280 kg, wheelbase 2.425 m, track 1.46 m, CoM height 0.45 m, 50/50 weight, power 206 kW, RWD, max steer 38°.
- Produces: exported `Telemetry { pos: Vec3; heading: Vec2; vel: Vec3; speed: number; slipDeg: number; drifting: boolean; wheelsOnGround: number; onRoad: boolean }`.
- Produces: `createDriftCar(world: RAPIER.World, cfg = carConfig): DriftCar` with `DriftCar { update(c: ControlState, h: number): void; telemetry(): Telemetry; resetTo(p: Vec3, yaw: number): void; body: RAPIER.RigidBody }`.

- [ ] **Step 1:** Loop tests: `advance(1/60)` with step 1/60 calls tick once; `advance(5)` (tab came back) calls tick at most `maxFrame/step` = 2 times; alpha is in [0,1).
- [ ] **Step 2:** Run, FAIL. Implement. Run, PASS.
- [ ] **Step 3:** Build `driftCar.ts`: Rapier dynamic body + 4 ray-cast suspension wheels; longitudinal force from throttle on rear wheels; lateral force per wheel from `lateralGrip`, rear scaled by `rearGripScale`; steering through `counterSteerAssist`.
- [ ] **Step 4:** Grey-box scene in `main.ts`: flat plane, 30 cones, box car. Expose `window.__drift = { telemetry }` only when `import.meta.env.DEV`.
- [ ] **Step 5:** e2e `drive.spec.ts`: hold W for 3 s → speed > 15 m/s; then hold W + D + Space for 1.5 s → `telemetry().drifting === true` at some sample; release all for 4 s → |slipDeg| < 5.
- [ ] **Step 6:** Run, PASS. Commit `feat: raycast drift car on fixed-step physics`.

### Task 1.4: Chase camera

**Files:** Create `src/camera/chaseCamera.ts`. Test `tests/unit/chaseCamera.test.ts`.

**Interfaces:** Produces `createChaseCamera(cam: THREE.PerspectiveCamera): { update(t: Telemetry, dt: number): void; toggleMode(): void; mode: 'chase' | 'top' }`. Exports pure `chaseTarget(t: Telemetry): { pos: Vec3; look: Vec3 }`.

- [ ] **Step 1:** Tests: at rest the camera sits 6 m behind and 2.2 m above along heading; at 20 m/s with β = 30° the camera's horizontal direction lies between heading and velocity, at least 60% toward velocity; FOV rises from 60° to 72° between 0 and 40 m/s; top mode is 18 m up looking down at 55°.
- [ ] **Step 2:** FAIL, implement with critically damped springs, PASS. Commit `feat: chase camera`.

### Task 1.5: PR and FUN GATE

- [ ] **Step 1:** Open PR `M1 drift grey-box`, superpowers review, fix, merge, deploy.
- [ ] **Step 2:** Send the user the live link and a 20-second recording. Ask: does the slide feel right, is the handbrake too strong, is the camera good. Tune `carConfig` and assist strength from their answers in follow-up PRs. **Do not start M2 until the user says the feel is right.**

---

## M2 · Art direction to match the reference (ends at the STYLE GATE)

Outcome: the grey-box scene rendered in the reference style, with a real FD car model.

### Task 2.1: Toon material and palette
**Files:** `src/render/toon.ts`, `src/render/palette.ts`. Test `tests/unit/palette.test.ts`.
**Interfaces:** `toonMaterial(opts: { color: string; shadow: string; bands: 2 | 3; rim?: string }): MeshToonNodeMaterial`.
**Tests:** palette has every token from spec §5; every token parses as hex; contrast of HUD text tokens vs. sky ≥ 4.5:1.

### Task 2.2: Post chain
**Files:** `src/render/post.ts`.
**Interfaces:** `createPost(renderer, scene, camera): { render(speed: number): void; setReducedMotion(on: boolean): void; setTier(t: 'high' | 'mid' | 'low'): void }`. Tier `mid` drops motion blur and embers; `low` also swaps edge outlines for inverted-hull and sets DPR 1. Passes: depth+normal edge outline, bloom (lights and headlights only via emissive threshold), colour grade toward magenta/violet, radial motion blur and speed lines scaled 0 at 15 m/s → full at 45 m/s, vignette.
**Tests:** e2e screenshot at fixed seed and camera, compared by colour histogram against `drift-folio-style-ref.png`: dominant hues in the magenta-violet and orange bands; reduced-motion flag produces zero blur (pixel diff of two frames at speed is under threshold).

### Task 2.3: FD car model
**Files:** `public/models/fd.glb`, `src/vehicle/carVisual.ts`, `ASSETS.md`.
**Decision (user):** model source, see open question 1 at the end. Requirements: ≤ 25k triangles, separate wheel nodes `wheel_fl/fr/rl/rr`, headlight emissive material, no logos.
**Interfaces:** `loadCarVisual(): Promise<{ root: Object3D; wheels: Object3D[]; setHeadlights(on: boolean): void }>`; wheels follow `driftCar` suspension.
**Tests:** e2e asserts model loads, four wheels exist, triangle count ≤ 25k.

### Task 2.4: Tyre smoke, skids, leaves
**Files:** `src/fx/smoke.ts`, `src/fx/skids.ts`, `src/fx/leaves.ts`.
**Interfaces:** `smoke.emit(at: Vec3, intensity: number)`, `skids.add(wheelPos: Vec3, width: number, alpha: number)`, ring buffer of 4,000 quads; `leaves.update(dt, wind)`.
**Tests:** skid buffer never exceeds capacity after 10,000 adds; smoke emits only while `drifting` (unit test on the emitter gate).

### Task 2.5: PR and STYLE GATE
Three fixed shots (summit start, hairpin under a lamp, mid-drift chase) side by side with the reference, at tiers high and low; send to the user, who is the only approver. **Do not start M3 until the user approves the look.**

---

## M3 · The mountain

### Task 3.1: Road network data
**Files:** `src/world/roadNetwork.ts`. Test `tests/unit/roadNetwork.test.ts`.
**Interfaces:** `RouteId` (from M0) plus `'summit' | 'town' | 'return'`; `roadNetwork: { nodes: Node[]; edges: Edge[] }`, `Edge { id; from; to; route: RouteId; points: Vec3[]; width: number }`; `routeLength(route): number`; `pathFromSummitToTown(route): Edge[]`; `nearestOnRoad(p: Vec3): { edgeId; t; dist }`.
**Tests:** summit node at y = 0, town node at y = −120 ± 1; each of the three descents 600–1000 m; every edge reachable from the summit and every edge reaches the town; the return road connects town to summit; Fork 2 splits and rejoins on the platform route; max gradient ≤ 14%.

### Task 3.2: Terrain
**Files:** `src/world/terrain.ts`.
**Interfaces:** `buildTerrain(net): { mesh; collider; heightAt(x, z): number }`. Heightfield 512×512, carved so road edges sit 0.1 m above terrain with a 6 m shoulder blend.
**Tests:** `heightAt` along every road point is within 0.3 m of road height; no NaN.

### Task 3.3: Road mesh, rails, lamps
**Files:** `src/world/roadMesh.ts`, `src/world/props/rails.ts`, `src/world/props/lamps.ts`.
**Interfaces:** `buildRoads(net): { meshes; colliders; railColliders: Map<edgeId, Collider> }`. Rails on the outside of every curve tighter than 60 m radius; a lamp on every hairpin (radius < 25 m).
**Tests:** count of lamps equals count of hairpins in `roadNetwork`; rails exist on every hairpin outside edge.

### Task 3.4: Checkpoints and stuck reset
**Files:** `src/world/checkpoints.ts`. Test `tests/unit/checkpoints.test.ts`.
**Interfaces:** `createCheckpoints(net): { update(t: Telemetry, dt): ResetReason | null; last(): { pos; yaw } }`, `ResetReason = 'fell' | 'stuck' | 'manual'`.
**Tests:** y < −200 returns `'fell'`; off-road and speed < 0.5 for 4.0 s returns `'stuck'`, 3.9 s returns null; checkpoint advances every 50 m along the road.

### Task 3.5: Props and dressing
**Files:** `src/world/props/{trees,torii,tunnel,railway,powerlines,town}.ts`.
Instanced maples and pines with seeded placement off-road; torii at summit; tunnel on Systems Drop; railway band above town; town buildings, garage shell, vending machines, shrine. Tests: tree instances never within 4 m of a road centreline; draw calls ≤ 250 (e2e reads `renderer.info`).

### Task 3.6: PR M3, superpowers review, merge, deploy.

---

## M4 · Most Wanted drift scoring and HUD

### Task 4.1: Score state machine
**Files:** `src/game/driftScore.ts`. Test `tests/unit/driftScore.test.ts`.
**Interfaces:** `createDriftScore(): { step(i: { drifting: boolean; slipDeg: number; speed: number; dt: number; crashed: boolean }): ScoreEvent[]; state(): { running: number; multiplier: number; banked: number } }`, `ScoreEvent = { type: 'start' | 'multiplier' | 'bank' | 'crash'; value: number }`.

```ts
// 1 s drift at 30°, 20 m/s, ×1  → running 600
// end, new drift starts 1.0 s later → multiplier 2
// new drift starts 1.6 s after previous end → multiplier stays 1
// six chained drifts → multiplier capped at 5
// 2.0 s without drift → 'bank', banked += running, running = 0, multiplier = 1
// crashed during running → 'crash', running = 0, banked unchanged
// dt of 5 s is clamped to 1/30 before scoring
```

### Task 4.2: Route runs
**Files:** `src/game/routeRun.ts`, `src/util/storage.ts`. Test `tests/unit/routeRun.test.ts`.
Run starts on leaving the summit pit box, ends on entering the town zone; route chosen by the edges driven; best per route stored. Off-road > 1.0 s raises `crashed` except inside the S2 zone.

### Task 4.3: Safe storage
**Tests:** when `localStorage.setItem` throws, `storage.set` returns false and `storage.get` returns the in-memory value; corrupted JSON returns the default.

### Task 4.4: HUD
**Files:** `src/ui/hud.ts`. Running score counter with multiplier badge, "BANKED +n" stamp, "CRASH" flash, speed, route name on entry. Styled to the reference (condensed italic display face, magenta/orange). e2e: drift in the grey-box area shows a non-zero counter, then a bank stamp.

### Task 4.5: PR M4.

---

## M5 · Project corners

### Task 5.1: Apex triggers
**Files:** `src/game/triggers.ts`. Test `tests/unit/triggers.test.ts`.
**Interfaces:** `createApexTriggers(defs: { id: ProjectCard['id']; pos: Vec3; radius: number }[]): { update(t: Telemetry): { opened?: string; hinted?: string } }`.
**Tests:** passing within radius while drifting returns `opened`; passing straight returns `hinted`; one open per pass (no re-fire until the car leaves radius + 5 m).

### Task 5.2: Billboards and cards
**Files:** `src/world/props/billboards.ts`, `src/ui/card.ts`. Billboard flips open in 3D; HTML card shows title, blurb, stack chips, "private" tag or "Go" link. Drive over the Go pad or press Enter to open the URL in a new tab.
**Tests:** e2e for one public and one private card: the public has an `a[href^="https://github.com/molotovgit/"]`, the private has none.

### Task 5.3: Card copy
Draft blurbs and stack chips for the five private cards (C1, C2, C3, C7, C9) from each repo's description and README, CV-level only. Send all nine cards to the user as one list for approval; launch is blocked on it.

### Task 5.4: Signposts at Fork 1 and Fork 2, route names lighting up under 12 m/s.

### Task 5.5: PR M5.

---

## M6 · Base town

Tasks: 6.1 pit garage with README line on the pit wall, tyre-rack skills, toolbox links (drive-on pads), cluster whiteboard; 6.2 skidpad lot with donut ring scoring (reuses `driftScore` with its own board), gymkhana timer, tyre bowling (physics pins); 6.3 six lanterns bound to shortcut discovery state; 6.4 return road trigger back to summit. Tests: unit test for gymkhana timer start/stop/penalty (+2 s per cone hit); e2e teleports to town and asserts the three link pads open the expected URLs. PR M6.

## M7 · Shortcuts, secrets, ghost

Tasks: 7.1 discovery tracker (`secrets/discovery.ts`, unit-tested: each of S1–S6 discovered once, persisted through `storage`, lantern count = discovered count); 7.2 S1 jump ramp + landing zone; 7.3 S2 riverbed (off-road crash rule disabled inside zone, test in `routeRun`); 7.4 S3 rail gap; 7.5 S4 rest-stop lane with breakable vending machines; 7.6 S5 train on a 45 s timer with crossing barriers and collision; 7.7 ghost recorder/player (`secrets/ghost.ts`: record 20 Hz pos+yaw, compress, playback interpolation; unit test round-trips a 90 s run under 60 KB). Freeze `carConfig` (tag `handling-v1`), then record the Systems Drop ghost: the user drives it if they want to, otherwise a scripted racing-line driver records it and the ghost time is set about 10% slower than its best run; a CI test fails if `carConfig` changes without re-recording; 7.8 S6 hidden trail gated on beating the ghost, secret car recolour; 7.9 easter eggs: Konami code swaps car mesh, Mac mini convoy, horn sound; 7.10 breakable fences on sweepers. PR M7.

## M8 · Audio

Tasks: 8.1 engine sound from CC0 rotary loop samples with pitch/volume by RPM and load (or synthesised with WebAudio oscillators if no good CC0 loop exists); 8.2 tyre squeal by |β| and speed; 8.3 ambience per zone (mountain wind, tunnel reverb, town crickets), UI stamps; 8.4 mute toggle (M) persisted, audio unlocked on first input. Test: audio graph not created before first user input (e2e). PR M8.

## M9 · Phone, loading, performance, accessibility

Tasks: 9.1 touch controls (`ui/touch.ts`) with `touch-action: none` on the canvas, portrait shows a "rotate for best view" hint but still plays; 9.2 loading screen with progress and the about text visible while loading; 9.3 perf governor: average frame > 50 ms over 3 s steps quality down (shadows → post → DPR 1), still slow opens the skip overlay; context-loss handler; 9.4 meshopt + KTX2 asset pass to meet the 15 MB budget; 9.5 meta tags, Open Graph image (a styled screenshot), favicon, `noscript` fallback with the same content. Tests: e2e at 390×844 touch emulation drives forward with the on-screen gas; Lighthouse CI budget check on payload size. PR M9.

## M10 · Launch

- [ ] **Step 1:** Ask the user for the contact email and Telegram handle; add to `projects.ts` links.
- [ ] **Step 2:** Add `public/CNAME` with `amirbek.is-a.dev`, set `CUSTOM_DOMAIN=1` in the deploy build. PR, review, merge.
- [ ] **Step 3:** Fork `is-a-dev/register` as molotovgit, add `domains/amirbek.json`:

```json
{
  "owner": { "username": "molotovgit" },
  "records": { "CNAME": "molotovgit.github.io" }
}
```

  Open the PR from molotovgit with a screenshot and the live Pages URL, following their PR template. Show the user the PR text before opening it (outward-facing).
- [ ] **Step 4:** After their merge, set the custom domain: `gh api repos/molotovgit/drift-folio/pages -X PUT -f cname=amirbek.is-a.dev`, wait for the certificate, then enforce HTTPS.
- [ ] **Step 5:** Final whole-repo superpowers review and a launch checklist run: all e2e green, budgets met, works in Chrome, Firefox, Safari (BrowserStack-free: ask the user to check Safari on their device), phone check.

---

## Open questions for the user

The reviewer's other questions (art sourcing, who approves the look, phone quality tiers, private-card copy, the ghost lap, sketch vs spec) are settled in spec sections 5, 7, 8 and 12.

1. **Car model source.** (a) I script a low-poly FD in Blender headless and refine it with you, slower and riskier on looks; (b) you pick a CC-licensed RX-7 model, I strip logos and optimise it; (c) a paid model from a store you choose. My recommendation is (b).
2. **Contact details** for the garage toolbox: which email and Telegram, needed by M10.
3. **The `workflow` scope** on your GitHub login, needed in M0 for the deploy pipeline. It takes one device-code approval.

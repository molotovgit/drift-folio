# Drift Folio — Design

Status: approved sketch v0.4 (2026-10-23), art direction locked by user.
Owner: molotovgit (Amirbek). Target URL: https://amirbek.is-a.dev
Sketch: https://claude.ai/artifact/DYVSFVRe8QhKr8VHwVNGXB (local copy `docs/drift-folio-sketch.html`). Where the sketch and this spec differ, this spec wins.
Style reference: `drift-folio-style-ref.png` (this folder)

## 1. Intent

A playable 3D portfolio in the browser, in the spirit of bruno-simon.com, where instead of an off-road toy car you drift a Mazda RX-7 down a Japanese mountain. Each descent is one theme of Amirbek's work, and each corner on it is a project. The site should feel like a small game first and a CV second, but a recruiter must still be able to get the facts in under a minute.

Why now: the subdomain `amirbek.is-a.dev` is free, and is-a.dev only accepts sites with real content, so the portfolio is the gate to the domain.

## 2. Goals

- One continuous drivable world: summit start, three descents, base town, road back up.
- Drift handling that is fun with a keyboard within 30 seconds: handbrake, counter-steer assist, readable slides.
- Need for Speed: Most Wanted style drift scoring (counter, multiplier, bank, crash).
- Nine project corners driven by a single data file.
- Six shortcuts and a handful of secrets that reward exploring.
- Art matches the style reference (section 5). This is a hard requirement from the user.
- Runs in current Chrome, Edge, Firefox and Safari, desktop and phone.
- Hosted on GitHub Pages under `amirbek.is-a.dev`.

## 3. Non-goals

- No multiplayer, accounts, or server. Everything is static files.
- No realistic simulation. Feel target is Inertial Drift / Art of Rally, not Assetto Corsa.
- One car only at launch (the secret car from S6 is a recolour of the same model).
- No CMS. Project content is edited in code.

## 4. Anti-goals (would be a failure even if it works)

- Looks like a generic low-poly Three.js demo instead of the reference.
- A recruiter on a phone or a slow laptop cannot find the projects or contact details.
- Loads for more than ~10 seconds on a normal connection before anything moves.
- Shows Mazda logos or badges, or names private repos' internals beyond their public description.
- Any commit, PR or deploy not done as molotovgit, or a PR merged without the superpowers review (user rule).

## 5. Art direction (locked)

Reference: Inertial Drift style screenshot provided by the user.

- **Rendering:** cel-shaded / toon. 2–3 hard light bands per material, dark ink outlines on cars, rails, trees and buildings.
- **Time of day:** late dusk. Sky gradient magenta → violet → deep purple; sun already set behind the ridge.
- **Palette anchors:** sky `#c2407a → #5b2a6e → #2a1840`, foliage `#e0572e / #f08a3c / #b8322c`, road `#4a3a5c`, car teal `#2fb8a8` with violet shadow `#3a3a7a`, light glow `#ffb35a`. Final values tuned against the reference in M2.
- **Light:** warm orange street lamps on every hairpin, cool headlights with bloom, rim light on the car.
- **Atmosphere:** height fog tinted violet, drifting autumn leaves, ember-like sparks near lamps.
- **Motion:** radial motion blur and speed lines that scale with speed; tyre smoke rendered as swirling stylised wisps (the white spiral in the reference), not grey puffs.
- **Car:** Mazda RX-7 FD silhouette, teal paint, black wheels, glowing headlights, no manufacturer logos or badges anywhere. In-game it is called "FD".
- **Lighting is live, not baked**: toon shading needs real lights for the bands and the lamps. The sketch's "bake lighting like Bruno" note is superseded.
- **Approval:** the user is the only judge of "matches the reference". The style gate in the plan compares three fixed camera shots (summit start, a hairpin under a lamp, mid-drift chase) side by side with the reference.
- **Quality tiers:** desktop gets the full look. Phones and slow devices drop motion blur and embers first, then switch outlines to a cheaper inverted-hull method, then lower resolution. Toon bands, palette, fog and smoke stay on every tier, so the look is still recognisably the reference.
- **Asset sources:** world props (trees, rails, lamps, torii, buildings, terrain, road) are made by us, procedurally in code or scripted in Blender. CC0 packs are allowed for small props. Every third-party asset is listed in `ASSETS.md` with its licence. The car source is the user's decision (section 12).
- **Scene dressing:** autumn maples and pines, guard rails with reflectors, power lines along the road, torii gate, tunnel with sodium lights, railway crossing, vending machines, shrine.

## 6. World (from sketch v0.4)

Height: summit 0 m, base town −120 m. Each descent 600–900 m so one run takes 60–90 s.

| Area | Content |
|---|---|
| Summit | Pit box start, torii gate, AMIRBEK tyre-stack letters (physics, knock over), control hints painted on tarmac |
| Fork 1 | Signposts to the three routes; dirt shortcut west → centre |
| Automation Pass (west) | Long sweepers. C3 nets-generation-machine, C8 cca pipelines. Shortcut S4 rest-stop cut |
| Platform Ridge (centre) | Medium. Fork 2 splits and rejoins. C1 Akademiya-AI platform, C9 Akademiya Math, C2 Class A Recruiting Hub. Shortcut S2 dry riverbed |
| Systems Drop (east) | Tight hairpins, tunnel, lookout. C4 CnC Android port, C5 allowgram. Side branch: C6 Windows cluster, C7 agent rigs. Shortcuts S1 jump, S3 broken rail |
| Railway | Crosses all three routes above town. S5 timed freight train |
| Base town | Pit garage (about, skills tyre rack, links toolbox, cluster whiteboard), skidpad lot (donut ring, gymkhana, tyre bowling), vending machines, six lanterns (one lights per shortcut S1–S6 discovered), road back to summit |
| Hidden peak | S6 trail behind the torii, opens after beating the ghost lap. The shrine and the secret car (teal FD recoloured) wait at the top; driving into it swaps your car |

## 7. Projects (content)

Nine cards. Public repos get a "Go" link to GitHub; private ones get a "private" tag and no link.

| # | Card | Repo(s) | Public |
|---|---|---|---|
| C1 | Akademiya-AI platform | Akademiya-AI Backend, Mobile, Frontend | no |
| C9 | Akademiya Math | molotovgit/akademiya-math-app | no |
| C2 | Class A Recruiting Hub | s1gmamale1/Class-A-Recruiting-Hub | no |
| C3 | NETS generation machine | molotovgit/nets-generation-machine | no |
| C8 | Content automation (cca v5–v7) | molotovgit/cca-v5, v6, v6.2, v7 | yes |
| C4 | C&C Generals Zero Hour Android | molotovgit/CnC-Generals-ZeroHour-Android | yes |
| C5 | allowgram | molotovgit/allowgram | yes |
| C6 | 30-node Windows cluster | molotovgit/windows-cluster-host, -controller | yes |
| C7 | Agent rigs | SigmaLink, claude-code-telegram-bot, hermes-backup | no |

Private-card copy: Claude drafts the two-line blurb and stack chips for C1, C2, C3, C7, C9 from each repo's description and README, keeping to what a public CV would say (product purpose, stack, scale) and nothing about clients' data, credentials or internal systems. The user approves every card's text before launch.

About copy: the profile README line "Mostly systems work — an Android port of a 2003 RTS, education platform backends, and a few automation rigs." Skills shown: Python, TypeScript, C++, PowerShell, Kotlin, Dart. Links: GitHub molotovgit; email and Telegram to be supplied by user before launch.

## 8. Gameplay rules

- **Controls (keyboard):** W/↑ throttle, S/↓ brake/reverse, A D/← → steer, Space handbrake, Shift clutch kick, R reset to last checkpoint, C camera toggle, H horn, M mute.
- **Controls (touch):** left thumb virtual stick for steer, right side buttons gas, brake, handbrake.
- **Gamepad:** standard mapping supported.
- **Camera:** chase camera behind the car following velocity direction, not heading, so slides read. Toggle to a high Bruno-style camera with C.
- **Drift:** slip angle β = angle between heading and velocity. Drifting when |β| ≥ 12° and speed ≥ 8 m/s.
- **Score:** each frame adds `|β|° × speed(m/s) × dt × multiplier`. Multiplier starts ×1, steps +1 each time a new drift starts within 1.5 s of the previous one ending, cap ×5.
- **Bank:** after 2.0 s with no drift, the running score banks into the route total.
- **Crash:** guard-rail or wall contact with impulse above threshold, or leaving the road for more than 1.0 s (except on S2), discards the unbanked score and resets multiplier.
- **Route best:** each route stores best total for a summit-to-town run in localStorage.
- **Project corners:** an apex trigger per corner; passing it while drifting opens the card. Passing it straight shows a small hint "drift this corner". Card also reachable from the menu.
- **Ghost lap:** a recorded run on Systems Drop, played as a translucent car. Beating its time unlocks S6. Handling is frozen before recording; any later physics change requires re-recording. The user records it if they want; otherwise Claude records it with a scripted racing-line driver and sets its time to a clean but beatable run (about 10% slower than the best scripted run).

## 9. Recruiter path

- A small persistent "Skip the game" link opens an HTML overlay with the about text, the nine cards and contact links. Same data file as the 3D cards.
- If WebGPU and WebGL2 are both unavailable, or the device is too slow (avg frame > 50 ms over 3 s), show that overlay automatically.
- `prefers-reduced-motion` turns off motion blur, speed lines and camera shake.

## 10. Technical constraints (decided)

- Three.js with `WebGPURenderer` and TSL node materials; WebGL2 backend fallback is automatic.
- Rapier (`@dimforge/rapier3d-compat`) for physics; car is a custom raycast vehicle so rear grip is fully under our control.
- Vite + TypeScript, no UI framework. HTML/CSS overlay for HUD and cards.
- Vitest for pure logic; Playwright for smoke and screenshot checks.
- Assets as glTF with meshopt compression; textures KTX2 where large.
- Budgets: initial payload ≤ 15 MB, first interactive frame ≤ 8 s on 20 Mbps, 60 fps on a 2020 mid laptop, 30 fps on a 2022 mid phone.
- Repo: new public repo `molotovgit/drift-folio`. Deploy: GitHub Pages via GitHub Actions. Custom domain `amirbek.is-a.dev` via a PR to `is-a-dev/register`.
- Every change lands as a PR reviewed with the superpowers code-review skill, findings fixed before merge, all as molotovgit.

## 11. Left to the builder

Exact shader techniques for outlines and motion blur, physics tuning values, terrain generation method, road mesh construction, particle implementation, audio sources (must be CC0 or self-made), file layout inside `src/`, and the exact length and curvature of each road as long as section 6 holds.

## 12. Decisions made by Claude, not the user (flagged for review)

- Chase camera as default; Bruno top-down as a toggle. (Reference image is a chase view.)
- Private repos appear as unlinked cards.
- Pit wall shows AMIRBEK; molotovgit appears only as the GitHub link.
- Dusk only, no day/night cycle. (Reference is dusk.)
- Car shape is "RX-7 FD inspired", no logos, named FD in game.
- Quality tiers for phones as in section 5.
- Private-card copy drafted by Claude, approved by the user.
- Ghost lap recorded by a scripted driver unless the user wants to drive it.

## 13. Open for the user

- **Car model source:** (a) Claude scripts a low-poly FD in Blender, (b) the user picks a CC-licensed RX-7 model and Claude strips logos and optimises it, (c) a paid store model. Recommendation (b).
- **Contact details** for the garage toolbox, needed before launch.

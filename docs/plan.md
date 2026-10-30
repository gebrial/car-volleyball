# Browser game plan

Settled in a /grill-with-docs session on 2026-10-24 in the training repo (rocket-league-bot), and moved here when this repo was created on 2026-10-27. Terms in bold are defined in `CONTEXT.md`. Python files, reports, milestones and ADRs named below are in the training repo; the court decision is its `docs/adr/0006-volleyball-court-floor-and-net.md`.

## Scope

The **browser game** is a car-volleyball game played against a trained bot, run entirely in the player's browser with no game server. v1 is a demo for the user and friends: playable, and the bot behaves as it does in RocketSim. Polish for strangers comes later. Multiplayer is out of scope for now.

The game lives in this repo, which is public. The training repo's part is producing **web releases** (an ONNX copy of a milestone's policy, labelled with the milestone name) and **parity fixtures**, and training the volleyball bot.

Soccer is never published. It exists only as the **soccer harness**: the browser pipeline running `stage11-low-gravity-aerial-curriculum-mid` on the real arena meshes from the user's own game dump, at the gravity and boost consumption that milestone trained at (read the exact values from the gravity schedule, not the report's "about 0.1x"). Its job is to prove the port against a bot whose correct play is already known, so that a wrong-looking volleyball bot can later be blamed on training rather than the port.

## Browser pipeline

- **Stack:** TypeScript, Vite and three.js; RocketSim compiled to WASM with Emscripten; the policy in ONNX Runtime Web. Hosted as a static site on GitHub Pages at volleyball.gebrial.ca, deployed by GitHub Actions.
- **No game assets ship.** The dumped Rocket League meshes stay local and gitignored from this repo's first commit. No Rocket League name, logos or car designs.
- **The bot samples its actions** from the policy's probabilities, as training, `eval.py` and `watch.py` do. The random generator is seeded so reported oddities can be replayed.
- **Controls:** the genre's standard gamepad and keyboard layouts, chase camera with a ball-cam toggle, gamepad first. Key rebinding comes after v1. Both cars use RocketSim's default car hitbox, which the bot trained with, and the full control set. The car gets a design and a name of its own.
- **Parity fixtures**, recorded from Python RocketSim, that this repo's CI must reproduce:
  1. observations from recorded game states, including the orange-side flip;
  2. action probabilities from those observations;
  3. the next state after one physics step from a set state and controls. Single steps, not whole replayed episodes, because car physics is chaotic. Soccer physics parity runs only locally (it needs the dumped meshes); CI covers open air, a flat floor, and later the volleyball court;
  4. volleyball rule events over recorded play: each point and why, each crossing, the shot clock every tick.

## This repo

Settled on 2026-10-27.

- **Name:** car-volleyball, a placeholder until the game has a real name. GitHub `gebrial/car-volleyball`, public. Code is MIT.
- **Releases:** the training repo's `copy_web_release.py` copies a web release into `releases/<milestone>/`: `release.json`, the fixtures in normal git, and the model in Git LFS, split into parts under 25 MiB (a limit of the first hosting plan, Cloudflare Pages, kept because it costs nothing) and joined on load. The joined bytes must match `release.json`'s SHA-256. Splitting keeps the float32 model the bot was measured with; fp16 is the fallback if download size ever matters.
- **Toolchain:** npm, TypeScript strict, Vite, Vitest. The fixture tests run in Node on `onnxruntime-web`'s WASM backend, the same runtime players get, with no browser automation until there is a page to test. CI on GitHub Actions runs the type check and the tests.
- **Both bots:** every release under `releases/` runs its fixtures, so CI covers soccer `-mid` (92 inputs, which exercise the boost pads) and `volleyball1-gravity-ramp-post` (94, the shot clocks).

## The public game (step 9)

Settled on 2026-10-27, when steps 4 and 5 were skipped to get to a playable game sooner.

- **Order:** a headless bot-vs-bot measurement in Node first, compared with `volleyball_measurements.py`'s numbers for `volleyball1-gravity-ramp-post`, which stands in for the soccer harness (the physics fixtures showed browser and Python play drift apart within a second, so the check has to be on how the bot plays, not on replays). Then the playable court: the player against the bot, one match, gamepad and keyboard, chase camera and ball cam, score and shot clock on screen, no menus. Then the first deploy, then match flow (start screen, pause, match over, rematch), then settings.
- **Input timing:** the player's controls are read every physics tick; the bot acts every 8 ticks, as it trained.
- **Look:** simple geometric cars, a team-coloured body the size of the hitbox, with wheels. Nothing from Rocket League, by name or by design.
- **Sides:** the player is always blue. The first server is random; after that the rally winner serves.
- **Settings in v1:** points to win (5, 11, 21) and the shot clock (4 to 12 s; the bot trained on 8 s, which the settings say). Gravity, boost and the touch limit stay at the training defaults until a bot trains on others.
- **Loading:** a plain progress bar while the 30 MB model downloads.
- **Devices:** desktop with a gamepad or keyboard; phones get a message saying so. No sound in v1.
- **Hosting:** GitHub Pages from GitHub Actions, at volleyball.gebrial.ca (a CNAME to `gebrial.github.io` at the user's DNS host, Squarespace). Cloudflare Pages was the earlier plan; nothing needs its custom headers yet.

## Watch mode

Settled in a /grilling session on 2026-10-29. Instead of playing, the viewer can watch the bot play a copy of itself.

- **Choosing it:** the start screen offers Play (A, Enter or Space) and Watch (X or Tab), and shows both as buttons that can be clicked or tapped. This is the first piece of match flow.
- **The bots:** both sides run the same release, one ONNX session, both observations in one batched call every 8 ticks, as `scripts/measure.ts` does. Pairing different releases waits until there is a second volleyball release worth comparing.
- **Camera:** a broadcast view by default, fixed, off the court's long side with blue on the left, moved along the court towards blue's end and aimed at the centre so the net is seen at an angle rather than edge on, and low enough that a ball's height reads clearly. Tuned by eye on 2026-10-29 (`BROADCAST_*` in `src/render/scene.ts`); a camera the viewer moves is issue #1. Y or C cycles broadcast, blue's chase cam and orange's chase cam. The chase views are always in ball cam, and the right stick still swivels them.
- **Text:** the HUD and the match result name teams by colour ("Orange's clock", "Blue wins 11–7"), with a small label naming the view and the button that changes it.
- **Between matches:** the final score shows for 4 s (A, Enter or a tap skips it), then a new match starts with a random first server, until the viewer leaves.
- **Leaving:** Esc or Back returns to the start screen from either mode, at once, abandoning the match. No confirmation, pause or speed controls yet; a confirmation belongs with pause, under match flow.
- **Phones:** phones can watch. The message becomes "Playing needs a keyboard or gamepad; tap to watch", and tapping the court cycles the views. There is no way back to the start screen on a phone, since it can only watch. It runs smoothly on a Pixel 9a (checked 2026-10-29).
- **Landscape on phones:** settled in a second /grilling session on 2026-10-29. On touch-only devices the game is always drawn landscape. While the browser's viewport is portrait, the whole page, start screen included, is drawn turned 90°; when the browser turns itself to landscape, either way, that turn is dropped and the browser's own rotation takes over. Nothing is locked: `screen.orientation.lock` needs fullscreen and doesn't exist on iPhones. Desktop is never turned.
- **Following the tilt:** while the viewport stays portrait (auto-rotate off), Android's `devicemotion` gravity picks which way the page is turned, so it is upright whichever way the phone is held. It flips only on a clear tilt and keeps the last direction while the phone is flat. With no tilt reading, the page is upright with the phone turned anticlockwise, Android's default landscape. The flip is instant.
- **Fullscreen on phones:** the tap that starts watching also asks for fullscreen, which hides the browser's URL bar and the system bars on Android. After the viewer leaves fullscreen, the next tap on the court goes back in, and later taps change the view. Where fullscreen doesn't exist (iPhone Safari), the request fails quietly. Desktop keeps the browser's own F11.
- **iPhones:** the page turns but the bars stay, and iPhones don't ask for motion permission, so they keep the default direction. A home-screen web app (a manifest with `"display": "fullscreen"`) and the motion prompt are issue #2, for when someone can test on an iPhone.

### Build order

Each step is one small commit, reviewed before it is committed.

1. **docs:** this section.
2. **refactor:** `src/main.ts` replaces the fixed player and bot teams with the set of teams the bot drives in this match, acted for in one batched call. Play behaves as before.
3. **feat:** the start screen's Play and Watch. Watch runs bot vs bot with the existing chase cam on blue; the HUD and result text name teams by colour.
4. **feat:** watched matches restart on their own after 4 s, skippable.
5. **feat:** Esc or Back returns to the start screen from either mode.
6. **refactor:** `scene.render` takes a camera view (`{ kind: "chase", team, ballCam, swivel }`) instead of separate arguments. The picture doesn't change.
7. **feat:** the broadcast view, watch mode's default. Framing tuned by eye.
8. **feat:** Y or C cycles broadcast, blue chase and orange chase while watching.
9. **feat:** phones can watch, tapping to start and to cycle the views. Dropped if it runs badly.
10. **feat:** phones draw the game landscape, turning the whole page 90° while the viewport is portrait.
11. **feat:** on Android, the turn follows the phone's tilt while the viewport stays portrait.
12. **feat:** phones go fullscreen on the tap that starts watching, and a tap after leaving it goes back in.
13. **docs:** a Progress line once it is live.

Steps 11 and 12 are checked on the Pixel 9a after a push; emulation can't fake tilt or fullscreen.

## Volleyball rules

- **Court:** a floor and a net only, with no walls and no ceiling (ADR 0006). The floor is an infinite plane with painted court lines. Each half is a 3500 × 3500 uu square, so the court is 3500 wide and 7000 long. The net's top is 450 uu above the floor. Both are single values in the court config, chosen from the measurements below.
- **Rally:** ends the moment the ball first touches the floor. Landing inside the lines scores for the player whose side it didn't land on. Landing outside scores against whoever touched it last, or against the server if nobody touched it. A ball off the net stays in play, and a car touching the net is not a fault.
- **Crossing:** a car whose centre passes the plane of the net (extended upward without limit) explodes and respawns at once, with no delay, at rest in the middle of its own back line, facing the net and keeping its boost. The rally goes on.
- **Serve:** a tee. The ball rests 250 uu above a spot 1000 uu in front of the server's spawn, until the server strikes it. The winner of the previous rally serves. In training, the serving side is random per episode (ADR 0007).
- **Shot clock:** from a player's first touch on their side, they have N seconds to send the ball back over, or they lose the rally. The clock stops and resets when the ball crosses the net. The serve starts the server's clock at once. Until 2026-10-26 the clock started when the ball crossed, and the stage 1 ramp found the hole: a serve hit high enough over the net stayed out of reach until the receiver's clock ran out. A ball nobody touches always lands, so only touching can stall, and the clock only needs to start there.
- **Touch limit:** a setting, unlimited by default. Touches count each separate contact, with held contact counting once; the count resets when the ball crosses the net.
- **Settings and defaults:** touch limit unlimited, boost unlimited, gravity normal (1.0x), shot clock length about 8 s (to be confirmed by play), match first to 11 points and win by 2. All are settings, but the bot trains on the defaults.

The rules are written twice: as RLGym pieces in the training repo (a done condition, a serve state mutator, the reward) and as TypeScript game logic here. The event fixtures keep the two in agreement. They don't go into the RocketSim fork, so that tweaking a rule never needs a rebuild of the Windows wheel and the WASM build.

## Court measurements

Measured on 2026-10-24 at normal gravity with `court_measurements.py`.

How high the car reaches without boost (roof height, then the highest ball centre it can touch from below): a tapped jump 129 and 220, a held jump 272 and 363, a double jump 528 and 620. With unlimited boost there is no flying limit, so the net can't stop anyone flying over. Its height only decides what a jump can do. At 450, a held jump can't hit the ball above the net, but a double jump can, which gives a spike, the way a real net sits below a jumping player's reach.

Driving from rest, with boost and then without: 1000 uu in 1.03 s and 1.38 s, 2000 in 1.56 and 2.15, 3000 in 1.99 and 2.86, 5000 in 2.86 and 4.28. From the middle of a 3500 half, the farthest corner (2475 uu) takes about 1.8 s with boost, while a 1500 uu/s lob at 45° hangs 3.2 s and carries 3242. A defender in position can chase down lobs. Placement and spikes beat one out of position.

Ball flight with no arena (range, apex, hang time): 1500 uu/s at 45° gives 3242, 833 and 3.2 s; 2000 at 45° gives 5647, 1468 and 4.3 s; 2000 at 60° gives 4801, 2182 and 5.2 s; 2500 at 60° gives 7310, 3370 and 6.4 s. A medium lob already peaks above soccar's 2048 ceiling, which is why the court has none.

In 20 self-play episodes at normal gravity, `stage14-goal-only-reward-post`'s 725 touches sent the ball off at a median 1292 uu/s (90th percentile 2133, 99th 3027), but almost flat: median elevation 1°, 90th percentile 17°, and 3% rising above 30°. The soccer bot hits along the ground. Lofting the ball over a net is what volleyball training has to teach.

## What the bot observes

`DefaultObs`, plus two inputs appended at the end: the bot's own shot clock and the opponent's, each scaled from 1.0 (full, or not running) down to 0. The touch count is not observed. With no boost pads on the court, `DefaultObs`'s 34 pad inputs read "all available", and boost reads as full. Positions keep `DefaultObs`'s coefficients, so the ball's height input goes past 1.0 above soccar's ceiling.

A soccer milestone takes the two new inputs by zero-initialized widening: copy every weight of the policy's and the critic's first layer, and add zero weights for the new columns. The widened network gives exactly the soccer policy's outputs, and the new weights still receive gradient whenever the clock inputs are non-zero. Adam's state for those layers grows with zeros (or resets). The widened checkpoint is milestoned before any volleyball training starts.


## Build order

Each step ends in something checkable before the next starts.

1. **Export (training repo).** A web-release script exports `-mid`'s policy to ONNX, checks it against PyTorch, and records the observation and policy fixtures.
2. **Policy in the browser.** This repo's scaffold and CI; JS observation builder and ONNX Runtime Web passing those fixtures. No physics yet.
3. **RocketSim in WASM.** Emscripten build with gravity and boost settings exposed; one-step physics parity.
4. **Soccer harness, bot vs bot.** three.js rendering of `-mid` playing itself locally, matching what `watch.py` shows.
5. **Soccer harness, human vs bot.** Gamepad and keyboard input, ball cam.
6. **Volleyball physics.** The bindings fork from ADR 0006 and its prototype checks (car ground detection and ball bounces on the added floor and net), the same shapes in the WASM build, and the measurements that set the net and court size (done; see Court measurements).
7. **Volleyball rules, twice.** Python env pieces and TypeScript logic, with the event fixtures passing.
8. **Volleyball stage 1.** Designed on 2026-10-25 (ADR 0007): `-mid` widened, a 50M critic warm-up at 0.3804x, then gravity ramped to 1.0x over 500M steps. Rally outcome reward only, one rally per episode, tee serve. Closed on 2026-10-27, kept.
9. **The public game.** Court rendering, match flow, settings, deploy.

Steps 6 and 7 don't depend on steps 2–5. Volleyball training does not start until step 7's fixtures pass.

## Progress

- Step 1 done on 2026-10-24: `web_release.py` builds `web-releases/stage11-low-gravity-aerial-curriculum-mid/`. ONNX matches PyTorch to 7.8e-7 over 450 samples, and `tests/test_web_release.py` rebuilds every observation from the raw RocketSim fields alone. `-mid` trained at 0.3804x gravity with unlimited boost (from `gravity_curriculum.physics_at`).
- The step 6 measurements are done (above).
- The bindings fork is built and verified on 2026-10-24: `Arena.add_static_plane()` and `Arena.add_static_mesh()` on branch `static-collision-shapes` of a clone of mtheall/RocketSim at `../RocketSim`, with 9 new tests in its `unit_test.py`. Installed in the training repo's venv on 2026-10-24 (fixtures unchanged, all tests pass); pushed on 2026-10-27 to the fork github.com/gebrial/RocketSim, which stays a fork: it won't be proposed upstream. What's left of step 6 is the same shapes in the WASM build.

- Step 7's Python half done on 2026-10-24. `volleyball.py` holds the rules with no simulator in them (`Rally` per tick, `Match` for score and serve). `volleyball_engine.py` runs them after every physics tick on the court (`VolleyballEngine`, `VolleyballServe`, `RallyOver`). `volleyball_fixtures.py` records `web-releases/volleyball-rules/fixtures/rules_events.json` (28 sequences, every event and every way a rally ends) for the TypeScript port. Choices made in code: both cars serve from the middle of their back lines; a landing is the ball within 5 uu of resting height, or its vertical velocity flipping upward below 40 uu with no car touching it that tick. Left for volleyball stage 1: the observation (shot clock inputs, the missing boost pads), the reward, and how episodes map to rallies.

- Volleyball stage 1 designed on 2026-10-25, recorded in ADR 0007 and summarised in step 8. The serve became a tee, replacing the first version's dropped ball.

- Volleyball stage 1 training started on 2026-10-26. The first ramp found the shot clock hole (see Shot clock) at 0.64x; the clock now starts at each side's first touch, and training restarted from the widened `-pre` milestone with a new warm-up. The second ramp started from `volleyball1-gravity-ramp-warmup-end`.

- Volleyball stage 1 closed on 2026-10-27, kept (`reports/volleyball1-gravity-ramp/`). `milestones/volleyball1-gravity-ramp-post` returns the ball over the net in 91% of rallies at 1.0x, against 22% at the start. The server wins 69% of rallies, and the next volleyball stage takes that on.

- Step 2 done on 2026-10-27. `web_release.py --volleyball` exported `volleyball1-gravity-ramp-post` (94 inputs, 821 samples; ONNX matches PyTorch to 1.13e-5, float32 rounding at logits up to ±150, so the bar is now 5e-5). `src/obs.ts` rebuilds every recorded observation of both releases to 1e-6, and `onnxruntime-web` gives the recorded probabilities within 5e-5.

- Step 7 done on 2026-10-27. `src/volleyball.ts` ports `volleyball.py` (`Rally`, `Match`) and replays all 30 sequences of `fixtures/volleyball-rules/rules_events.json` with identical events and shot clock values every tick. Breaking rules on purpose showed two the fixtures never exercised: a car touching the ball as it flips upward near the floor, and the receiver hitting out. `volleyball_fixtures.py` now hand-builds both. `Match` has no fixtures; its tests check the serve, first to 11, and win by 2 directly.

- Step 3 done on 2026-10-27 for open air, a flat floor and the volleyball court, which also covers step 6's WASM shapes. `vendor/RocketSim` is the fork as a submodule, built with Emscripten 6.0.13 by `scripts/build-wasm.mjs` (590 KB of WASM, no `-ffast-math`), bound in `wasm/bindings.cpp` and typed in `src/physics.ts`. The training repo's `physics_fixtures.py` records 100 samples per arena, each set into a fresh arena on both sides, with contacts set up on purpose (ball at a car, car at car, ball at the net). WASM is not bit-exact with native Windows RocketSim. One tick agrees to float32 rounding (at most 3.7e-4 uu/s on speeds near 2300, where float32 steps are 2.4e-4). Over 8 ticks, a contact amplifies that to as much as 0.66 uu and 11 uu/s, while samples without a contact stay near rounding. So a WASM bot will drift from its Python twin within a second of contact-heavy play, and the soccer harness has to be judged by behaviour, not replay. The soccer arena's meshes (local only) are not covered yet.

- Step 9's headless measurement done on 2026-10-27. `scripts/measure.ts` plays `volleyball1-gravity-ramp-post` against itself on the WASM court (`src/game.ts`, `src/court.ts`, `src/bot.ts`), 400 rallies in about a minute. Over three seeds each, the browser and Python's `volleyball_measurements.py` agree: server won 65.5% and 67.1%, touches per rally 5.47 and 5.52, rallies ending in, out and on the clock 582/583/35 and 589/582/30, about 18.5 car crossings a minute in both. The ball came back over the net in 94.8% of browser rallies and 92.7% of Python ones, about two standard errors apart: small enough to be noise, or a small difference in the serve's starting car state (the browser starts from RocketSim's default car state, Python from rlgym's). The bot plays in the browser as it does in training.

- The playable court went live on 2026-10-27 at https://volleyball.gebrial.ca: the player on blue against `volleyball1-gravity-ramp-post`, one match to the defaults, then play again (`src/main.ts`, `src/input.ts`, `src/render/scene.ts`). Gamepad controls follow the user's layout (LB/RB air roll and powerslide, right stick swivels the camera). The camera circles the car at an eased angle; car cam follows the car's horizontal travel in the air. CI publishes `main` to GitHub Pages after the checks pass. Next: watch mode (above), whose start screen begins match flow; then the rest of match flow (pause, match over, rematch), then settings.

## Open

- Shot clock length. Stage 1 trains on 8 s throughout.
- Crossing respawn. Volleyball stage 2 (the serve advantage, notes in the training repo's `reports/volleyball-stage2-notes.html`) may add a delay to the instant respawn. That changes `src/volleyball.ts` and the rules fixtures along with the Python rules.

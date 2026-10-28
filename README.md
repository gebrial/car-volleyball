# car-volleyball

Car volleyball against a trained bot, run entirely in the browser. The bot is
trained by self-play in RocketSim, in a separate training repo
(rocket-league-bot), and runs here through ONNX Runtime Web.

The plan and the build order are in `docs/plan.md`, and the terms it uses are
in `CONTEXT.md`.

## Running

    git clone --recurse-submodules <this repo>
    npm install
    npm run build:wasm   # RocketSim to WASM; needs Emscripten 6.0.13 (em++ on PATH, or $EMXX)
    npm test             # the parity fixtures
    npm run dev

Git LFS holds the model files, so clone with LFS installed. RocketSim comes
from the fork github.com/gebrial/RocketSim (branch `static-collision-shapes`,
which adds the court's floor and net shapes) as the submodule
`vendor/RocketSim`. `wasm/bindings.cpp` is what TypeScript sees of it, typed
in `src/physics.ts`.

## Releases

`releases/<milestone>/` holds one web release each: `release.json`, the model
split into `policy.onnx.part*` (Cloudflare Pages refuses files over 25 MiB),
and the parity fixtures recorded in Python RocketSim. They come from the
training repo:

    python web_release.py <milestone> [--volleyball] --gravity <g> --boost-consumption <b>
    python copy_web_release.py <milestone> ../car-volleyball

The tests run every release's fixtures, so a new release is covered as soon
as it is copied in.

## Rules fixtures

`fixtures/volleyball-rules/rules_events.json` comes from the training repo's
`python volleyball_fixtures.py`, copied in by hand. `src/volleyball.ts` must
replay every sequence in it with the same events and shot clock.

## Physics fixtures

`fixtures/physics/one_step.json` comes from the training repo's
`python physics_fixtures.py`, copied in by hand: whole car and ball states
with controls, and the states 1 and 8 ticks later, in open air (at the soccer
bot's 0.3804x gravity), on a flat floor, and on the volleyball court.

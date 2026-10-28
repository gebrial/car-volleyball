# car-volleyball

Car volleyball against a trained bot, run entirely in the browser. The bot is
trained by self-play in RocketSim, in a separate training repo
(rocket-league-bot), and runs here through ONNX Runtime Web.

The plan and the build order are in `docs/plan.md`, and the terms it uses are
in `CONTEXT.md`.

## Running

    npm install
    npm test        # the parity fixtures
    npm run dev

Git LFS holds the model files, so clone with LFS installed.

## Releases

`releases/<milestone>/` holds one web release each: `release.json`, the model
split into `policy.onnx.part*` (Cloudflare Pages refuses files over 25 MiB),
and the parity fixtures recorded in Python RocketSim. They come from the
training repo:

    python web_release.py <milestone> [--volleyball] --gravity <g> --boost-consumption <b>
    python copy_web_release.py <milestone> ../car-volleyball

The tests run every release's fixtures, so a new release is covered as soon
as it is copied in.

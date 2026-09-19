# Tools

## mock-robot.mjs — test the webapp without a robot

A zero-dependency Node script that emulates everything the webapp talks to on a
real Control Hub:

- **FtcDashboard WebSocket** on `ws://localhost:8000/` — OpMode list, robot
  status, `INIT_OP_MODE` / `START_OP_MODE` / `STOP_OP_MODE`
- **PathServer HTTP** on `http://localhost:8099` — `POST /points`,
  `GET /pose`, `GET /start`, `GET /config`, with the same CORS headers and the
  same partial-update semantics as the robot (absent `start` / `points` /
  `segments` / `alliance` keep previous values; an absent `tags` key resets
  tags). It accepts the **version 2** payload: `start`, `points`, `alliance`,
  `segments` (`type`, `headingMode`, `end`, `control`/`mid`, optional
  `samples`) and `tags` with `{index, segment, name, value}`. Each segment is
  validated the way the Pedro Pathing side would (known `type`, explicit
  `headingMode` of `straight`/`tangent`, required `control`/`mid`), so a bad
  payload fails with a 500 and a reason. A leftover global `velocity` /
  `tolerance` is ignored with a warning.
- **OpMode lifecycle gating** — like the real PathServer, the HTTP side is only
  reachable while an OpMode is INIT or RUNNING. Pass `--always-on` to disable.
- **A simulated robot** that drives the uploaded sampled `points` with a simple
  point-advance loop (it does not run Pedro Pathing), feeds `GET /pose` (so you
  see the live pose move in the webapp), and fires tags at the point each one is
  attached to: `velocity` sets the speed as a **percent of a fixed 40 in/s max**
  (values in 0-1 are treated as a fraction, anything above 1 as a percent),
  `pause` holds position, anything else is logged. `GET /config` (and every
  `POST /points` response) reports the stored alliance, point/segment/tag
  counts and the robot's motion limits as
  `robot: {maxSpeedInS: 40, maxStrafeSpeedInS: 34, maxDecelInS2: 30, maxAccelInS2: null}`,
  which the webapp uses for its playback time estimate (a null accel makes it
  fall back to the Setup value).

### Usage

```bash
node tools/mock-robot.mjs
```

Then open the webapp pointed at localhost instead of the robot:

```bash
npm run dev
# then browse to:
#   http://localhost:5173/?hub=127.0.0.1
```

The `?hub=` query parameter overrides `HUB_IP` from config (works for any
address, not just the mock). Everything else — Upload, Init/Start/Stop, live
pose, tags — behaves as it does against a real robot.

Note: the mock's console output is a live protocol trace (every WS message,
every HTTP request, tag firings, path completion) — useful when changing the
webapp's connection or upload code.

The `?hub=` override only works from an `http://` or `file://` page. The
HTTPS-hosted copy of the app (GitHub Pages) cannot reach `http://` localhost
or robot addresses — browsers block mixed content.

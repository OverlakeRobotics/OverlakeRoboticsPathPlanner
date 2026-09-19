# Tools

## mock-robot.mjs — test the webapp without a robot

A zero-dependency Node script that emulates everything the webapp talks to on a
real Control Hub:

- **FtcDashboard WebSocket** on `ws://localhost:8000/` — OpMode list, robot
  status, `INIT_OP_MODE` / `START_OP_MODE` / `STOP_OP_MODE`
- **PathServer HTTP** on `http://localhost:8099` — `POST /points`,
  `GET /pose`, `GET /start`, `GET /config`, with the same CORS headers and the
  same partial-update semantics as `PathServer.java` (absent `velocity` /
  `tolerance` / `alliance` keep previous values; an absent `tags` key resets
  tags — matching the real code)
- **OpMode lifecycle gating** — like the real PathServer, the HTTP side is only
  reachable while an OpMode is INIT or RUNNING. Pass `--always-on` to disable.
- **A simulated robot** that drives uploaded paths with the same point-advance
  logic as `OdometryHolonomicDrivetrain`, feeds `GET /pose` (so you see the
  live pose move in the webapp), and fires tags like `PathPlanExample`:
  `velocity` changes speed, `pause` holds position, anything else is logged.
  It also logs warnings where the *real* robot code would crash (starting with
  no uploaded path, `pause` tag on the start point).

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

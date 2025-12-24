# Overlake Path Planner

Overlake Path Planner is a browser-based tool for creating autonomous paths for FTC robots.
It runs fully offline from a release zip and can be opened by double-clicking `index.html`.

## Quick Start

1. Download the latest release zip from the GitHub releases on the right
2. Extract it
3. Open `index.html` in your browser

Optional: Edit `config.js` (next to `index.html`) to customize defaults and tag templates.

## Features

### Path building
- Place points by clicking on the field
- Choose segment types: Line, Bezier, Arc, or Free draw
- Switch alliance (Red/Blue) or mirror the path with one click

### Fast upload
- Connect to your robot's wifi and upload paths instantly
- Real time pose updating to see the robot position on screen
- Requires code from https://github.com/OverlakeRobotics/OverlakeRoboticsLibrary to be on the robot for direct upload and pose updating

### Edit mode
- Select and drag points directly on the field
- Expand any point in the right panel to edit X, Y, and heading
- Reorder points by dragging them in the points list

### Tags
Tags are metadata on points that the robot can read (velocity changes, waits, launch artifacts, etc.)
- Add tags to any point from the right panel
- Tags are run once the robot reaches the point the tag is attached to
- You can edit the code in your robots OpMode to change what each tag does
- Tags use templates from `config.js`, including units and defaults

### Global variables
Global variables let you update many tag values from a single number.
- Create globals in the left panel
- Set a tag value to use a global variable
- Change the global and all linked tags update automatically

### Import / Export
- Export paths as JSON for sharing or later edits.
- Reimport JSON to restore points, tags, and global variables.
- Design an OpMode to run directly from the JSON or use code from https://github.com/OverlakeRobotics/OverlakeRoboticsLibrary

## Notes

- The app is designed to run offline from a local `index.html`.
- If you update `config.js`, refresh the page to load changes.

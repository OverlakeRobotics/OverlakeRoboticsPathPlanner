const TAG_REGISTRY = [
  {
    id: "velocity",
    label: "velocity",
    description: "Set drivetrain target velocity (in inches/sec).",
    params: [{ name: "value", type: "number", default: 30, description: "Velocity in in/s" }],
  },
  {
    id: "pause",
    label: "pause",
    description: "Pause execution for specified seconds.",
    params: [{ name: "seconds", type: "number", default: 1, description: "Seconds to pause" }],
  },
  {
    id: "intake",
    label: "intake",
    description: "Control intake motor velocity; <=0 stops intake.",
    params: [{ name: "value", type: "number", default: 0, description: "Intake motor velocity" }],
  },
  {
    id: "autoAlignRed",
    label: "autoAlignRed",
    description: "Enable auto-alignment (red) at this point; adjusts heading.",
    params: [],
  },
  {
    id: "autoAlignBlue",
    label: "autoAlignBlue",
    description: "Enable auto-alignment (blue) at this point; adjusts heading.",
    params: [],
  },
  {
    id: "shooterVelocity",
    label: "shooterVelocity",
    description: "Set shooter flywheel velocity (encoder units).",
    params: [{ name: "value", type: "number", default: 0, description: "Shooter velocity" }],
  },
  {
    id: "hoodAngle",
    label: "hoodAngle",
    description: "Set shooter hood angle (degrees).",
    params: [{ name: "angle", type: "number", default: 0, description: "Hood angle in degrees" }],
  },
  {
    id: "launchArtifacts",
    label: "launchArtifacts",
    description: "Spin up shooter and run intake to launch for the given seconds.",
    params: [{ name: "seconds", type: "number", default: 2, description: "Duration in seconds" }],
  },
];

export default TAG_REGISTRY;
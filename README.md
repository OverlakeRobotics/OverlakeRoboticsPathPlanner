# Overlake Robotics Path Planner

A powerful, web-based path planning tool designed for robotics competitions (FTC/FRC). This application allows teams to visually design autonomous paths, configure robot constraints, and generate code for their robot controllers.

![Path Planner Screenshot](https://via.placeholder.com/800x450?text=Path+Planner+Interface)

## Features

### Path Design
- **Interactive Field:** Drag-and-drop interface with a field background.
- **Multiple Segment Types:** Create paths using **Lines**, **Bézier Curves**, and **Circular Arcs**.
- **Heading Control:** Choose from various heading strategies:
  - **Straight:** Maintain a specific heading.
  - **Tangent:** Follow the direction of travel.
  - **Orthogonal:** Face 90° left or right relative to the path.
- **Edit Mode:** Fine-tune your path by selecting, moving, or deleting existing waypoints.

### Robot Configuration
- **Physical Constraints:** Define robot length and width for accurate collision visualization.
- **Motion Profiling:** Set global velocity, maximum acceleration, and path tolerance.
- **Live Sync:** Connect to a running robot to visualize its live pose on the field (requires compatible robot server).

### Event Tagging
Attach metadata "tags" to specific waypoints to trigger robot actions during the path:
- **Velocity Overrides:** Change speed for specific segments.
- **Mechanism Control:** Triggers for Intake, Shooter, Hood Angle, etc.
- **Wait Commands:** Insert pauses at specific points.
- **Auto-Aim:** Flags for alliance-specific aiming (Red/Blue).

### Export & Import
- **Code Generation:** Automatically generates Java code (`Pose2D` arrays) ready to paste into your robot project.
- **Save/Load:** Export paths as JSON files to save your work and share with teammates.
- **Mirroring:** One-click path mirroring for Red/Blue alliance switching.

## Tech Stack

- **Frontend Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Language:** JavaScript (ESModules)
- **Styling:** CSS Modules / Standard CSS

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/OverlakeRobotics/OverlakeRoboticsPathPlanner.git
    cd OverlakeRoboticsPathPlanner
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

4.  **Open in browser:**
    Navigate to `http://localhost:5173` (or the port shown in your terminal).

## Usage Guide

### 1. Building a Path
- Use the **Build Panel** on the left to select your segment type (Line, Bezier, Arc).
- Click on the canvas to place waypoints.
- Adjust the **Heading Strategy** to control where the robot faces.

### 2. Editing Points
- Toggle **Edit Mode** in the Build Panel.
- Click any point on the canvas to select it.
- Use the input fields to adjust X, Y coordinates and Heading, or delete the point.

### 3. Adding Tags
- Expand the **Tags** section in the Build Panel.
- Select a point and choose a tag type (e.g., `intake`, `shooterVelocity`).
- Enter a value and click **Add Tag**.

### 4. Exporting
- Go to the **Run Panel** on the right.
- Click **Copy Code** to get the Java snippet.
- Click **Export JSON** to save the file for later editing.

## Project Structure

```
src/
├── assets/             # Static assets (field images, icons)
├── components/         # React components
│   ├── panels/         # Side panels (BuildPanel, RunPanel)
│   ├── CanvasStage.jsx # Main field visualization
│   └── ...
├── constants/          # Configuration (field size, defaults)
├── hooks/              # Custom React hooks (usePlayback, usePosePolling)
├── utils/              # Math and geometry helper functions
├── App.jsx             # Main application layout
└── main.jsx            # Entry point
```

## Contributing

Contributions are welcome! Please follow these steps:
1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

This project is proprietary to Overlake Robotics. Please contact the maintainers for usage rights.

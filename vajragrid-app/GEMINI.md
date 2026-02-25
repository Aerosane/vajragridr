# VajraGrid — Project Context for AI Assistants

## Project
VajraGrid — AI-Driven Cyber Defense System for Smart Power Infrastructure.
A hackathon prototype that detects cyberattacks on smart grids using simulated data.

## Tech Stack
- Next.js 16.1.6 (App Router, Turbopack)
- TypeScript 5.x
- React 19.2.3
- Tailwind CSS v4 (CSS-first config)
- Socket.IO 4.8.3 (real-time)
- Recharts (charts)
- @xyflow/react (grid topology map)
- ONNX Runtime Web (browser ML)

## Code Style
- TypeScript strict mode
- Functional components with hooks
- No class components
- Use `type` imports where possible
- Descriptive variable names
- Minimal comments — only where logic is non-obvious
- All files use single quotes or template literals for strings

## Project Structure
- `src/lib/types/` — shared TypeScript interfaces (GridTelemetry, ThreatAlert, etc.)
- `src/lib/constants/` — grid topology config, detection thresholds
- `src/lib/simulation/` — data generation, attack injectors
- `src/lib/detection/` — rule engine, physics checks, statistical detection, ML
- `src/lib/realtime/` — Socket.IO server and client
- `src/hooks/` — React hooks for real-time data
- `src/components/dashboard/` — main dashboard UI components
- `src/components/operator/` — attack control panel
- `src/app/` — Next.js pages and API routes

## Key Interfaces
All defined in `src/lib/types/`. Import from `@/lib/types`.
- `GridTelemetry` — per-bus sensor readings (voltage, frequency, power, etc.)
- `ThreatAlert` — detection alert with severity, confidence, indicators
- `SystemState` — grid-wide state summary
- `AttackConfig` — attack injection configuration

## Important
- This is a SIMULATION — no real grid data
- 5-bus power system (BUS-001 through BUS-005)
- Indian grid standards: 230kV nominal, 50Hz, CERC/IEGC thresholds
- Detection has 3 layers: Rules → Physics → Statistical/ML
- Dark theme dashboard, cybersecurity SOC aesthetic

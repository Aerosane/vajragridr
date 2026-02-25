# VajraGrid: AI-Driven Autonomous Cyber Defense for Smart Grids

**VajraGrid** is an advanced cyber defense system designed to protect smart power infrastructure from sophisticated cyber-physical attacks. By combining real-time physics-based validation with high-performance AI inference on **AMD Ryzen™ AI** hardware, VajraGrid detects and remediates threats in seconds—ensuring grid stability even under heavy attack.

## 🚀 The Vision: A Self-Healing Smart Grid
Modern power grids are increasingly vulnerable to False Data Injection (FDI), Command Spoofing, and IoT-driven demand manipulation. Traditional monitoring is too slow. VajraGrid introduces **VajraShield**, an autonomous response engine that isolates compromised buses and reroutes power in **under 16 seconds**, preventing cascading blackouts.

## 🧠 Core Architecture
VajraGrid utilizes a multi-layered detection pipeline to eliminate false positives and ensure deterministic action:

1.  **Rule Engine (L1):** Instant boundary checks based on CERC/IEGC standards (Voltage/Frequency limits).
2.  **Physics Engine (L2):** Real-time power flow validation to detect physical impossibilities in reported telemetry.
3.  **Statistical Engine (L3):** Identifies anomalous rate-of-change and drift patterns.
4.  **ML Detector (L4):** An ONNX-based anomaly detection model optimized for **AMD Ryzen™ AI NPUs** for high-speed edge inference.

## ⚡ AMD Hardware Acceleration
To meet the mission-critical latency requirements of power systems, VajraGrid is architected for the AMD ecosystem:
-   **Edge Inference:** The ML pipeline uses **ONNX Runtime** to offload anomaly detection to the **AMD Ryzen™ AI NPU** at the substation level, allowing for real-time protection even if cloud connectivity is severed.
-   **Centralized Analytics:** The backend is designed to scale on **AMD EPYC™** processors, handling high-throughput telemetry from thousands of grid nodes simultaneously.

## 🛠️ Tech Stack
-   **Frontend:** Next.js 16.1.6 (App Router), TypeScript, Tailwind CSS v4.
-   **Visualization:** `@xyflow/react` for real-time grid topology mapping.
-   **Intelligence:** ONNX Runtime Web for local AI inference.
-   **Real-time:** Socket.IO for live telemetry streaming.

## 🚦 Getting Started

### Prerequisites
-   Node.js 20+
-   pnpm (recommended)

### Installation
```bash
cd vajragrid-app
pnpm install
```

### Running the Prototype
1.  **Start the server:**
    ```bash
    pnpm dev
    ```
2.  **Open the Dashboard:** Navigate to `http://localhost:3010`.
3.  **Simulate Attacks:** Use the **Operator Console** at `/operator` to inject FDI or Command Spoof attacks and watch **VajraShield** respond in real-time.

## 💼 Startup Roadmap
VajraGrid is positioned as a B2B SaaS and Edge-Hardware solution for Distribution Companies (Discoms). Our roadmap includes:
-   **Phase 1:** Integration with existing SCADA/EMS systems via standardized protocols (IEC 61850).
-   **Phase 2:** Deployment of hardened edge gateways powered by **AMD Ryzen™ AI** for substation-level protection.
-   **Phase 3:** Predictive maintenance modeling using historical attack data to anticipate future vulnerabilities.

---
*Developed for the AMD Slingshot Hackathon 2026.*

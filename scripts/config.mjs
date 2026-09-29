// Everything here is hand-written copy. All numbers come from the GitHub API at build time.
export const LOGIN = "Wylp";

export const PROFILE = {
  role: "SOFTWARE ENGINEER · TECH LEAD",
  tagline: ["Arquitetura de software, sistemas distribuídos", "e o |código| que sustenta o negócio."], // |word| = accent
  quote: "take a coffee break, but don't break the code.",
};

// Featured repos. `desc` is used when the repo has no "About" text; each one is taken from the repo's README.
export const PROJECTS = [
  { repo: "Wylp/Corvo", cat: "MACOS · SWIFT 6", desc: "Clipboard history for macOS that remembers where things came from." },
  { repo: "Wylp/Lince", cat: "DESKTOP · TAURI + RUST", desc: "Desktop app to review GitHub pull requests with context and progress." },
  { repo: "Wylp/Sekiryu", cat: "DESKTOP · TAURI + RUST", desc: "Peer-to-peer Magic: The Gathering table for LAN play, in 2D and 3D." },
  { repo: "expo/knex-expo-sqlite-dialect", cat: "OPEN SOURCE · CONTRIBUTOR", external: true },
];

// [name, dailyDriver?]. Curated from the repos' manifests; vendor/hardware names are left out on purpose.
export const STACK = [
  ["LANGUAGES", [["TypeScript", 1], ["JavaScript", 1], ["Swift"], ["Go"], ["Rust"], ["Python"], ["C#"], ["Java"], ["C / C++"], ["HCL"], ["SQL"]]],
  ["BACKEND", [["Node.js", 1], ["NestJS"], ["Express"], ["gRPC"], ["Rust · Tokio"], ["WebSockets"], ["GraphQL"], ["Protobuf"], ["REST / OpenAPI"], ["Knex"], ["MCP servers"]]],
  ["FRONTEND", [["React", 1], ["Next.js"], ["Vite", 1], ["Tailwind"], ["TanStack Query"], ["Zustand"], ["Zod"], ["Three.js"], ["Angular"]]],
  ["MOBILE & DESKTOP", [["React Native", 1], ["Expo", 1], ["Expo Router"], ["SQLite"], ["Maps / GPS"], ["BLE"], ["Sentry"], ["Tauri"], ["macOS · Swift 6"]]],
  ["DATA & MESSAGING", [["PostgreSQL", 1], ["MySQL"], ["MongoDB"], ["Redis", 1], ["ClickHouse"], ["BigQuery"], ["Pub/Sub"], ["Looker"]]],
  ["CLOUD & INFRA", [["Google Cloud", 1], ["GKE / Kubernetes", 1], ["Docker", 1], ["Terraform"], ["GitHub Actions", 1], ["OpenTelemetry"], ["Prometheus"], ["AWS"], ["Railway"], ["NGINX"]]],
  ["IOT & TELEMATICS", [["GPS tracking"], ["Telemetry ingestion"], ["Binary protocols"], ["TCP / UDP sockets"], ["Webhooks"]]],
  ["VIDEO & STREAMING", [["H.264 / AVC"], ["H.265 / HEVC"], ["Video encoding"], ["Live video streams"]]],
  ["AI & TOOLING", [["Claude Code", 1], ["ONNX Runtime"], ["OpenCV"], ["OpenCode"], ["tree-sitter"], ["Jest"], ["Vitest"], ["E2E testing"], ["Arch Linux", 1], ["VS Code"], ["Git"]]],
];

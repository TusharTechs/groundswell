// MapLibre 6 loads its tile worker from a file next to its own module, which a
// bundler moves. Serve the worker from /public and point MapLibre at it.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");

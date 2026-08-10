import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: if you're deploying to https://<username>.github.io/<repo-name>/
// (a normal "project" GitHub Pages site), set base to "/<repo-name>/" below.
// If you're deploying to a "user site" repo named <username>.github.io,
// leave base as "/".
export default defineConfig({
  plugins: [react()],
  base: "/snip-log/",
});

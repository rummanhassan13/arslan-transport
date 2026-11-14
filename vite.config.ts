import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// In production builds, replace 'unsafe-inline' in the app's Content-Security-Policy with
// the exact hash of each inline script on the page, so injected scripts can't run.
// Dev mode keeps 'unsafe-inline' because Vite's hot reload adds its own inline script.
function cspScriptHashes(): Plugin {
  return {
    name: "csp-script-hashes",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (!html.includes("script-src 'self' 'unsafe-inline'")) return html;
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)]
          .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
        return html.replace("script-src 'self' 'unsafe-inline'", ["script-src 'self'", ...hashes].join(" "));
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), cspScriptHashes()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app/index.html"),
      },
    },
  },
});

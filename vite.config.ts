import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFile } from "node:fs/promises";

function inlineAuthTheme(): Plugin {
  let backend = "";
  let projectRef: string | undefined;
  const file = path.resolve(__dirname, "src/lib/supabaseAuthBootstrap.ts");
  return {
    name: "sett-inline-auth-theme",
    configResolved(config) {
      backend = config.env.VITE_SUPABASE_URL || "";
      projectRef = config.env.VITE_SUPABASE_PROJECT_ID;
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        const marker = "/* sett-auth-theme-bootstrap */";
        if (!html.includes(marker)) return html;
        const { code } = await transformWithEsbuild(await readFile(file, "utf8"), file, {
          format: "iife", globalName: "settAuthTheme", target: "es2020", minify: true,
        });
        const args = JSON.stringify([backend, projectRef]).replace(/</g, "\\u003c");
        return html.replace(marker, () =>
          `{ ${code}\nsettAuthTheme.bootstrapAuthTheme(...${args}); }`,
        );
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [inlineAuthTheme(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-router-dom",
      "@tanstack/react-query",
      "framer-motion",
      "@xyflow/react",
    ],
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "supabase": ["@supabase/supabase-js"],
          "xyflow": ["@xyflow/react"],
          "radix-core": [
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
});

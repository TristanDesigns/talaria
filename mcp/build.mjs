// Bundles the MCP server into one file and packs it as a Claude extension
// (.mcpb). Output: mcp/bundle/ and dist-mcp/talaria.mcpb
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.production", "utf8")
    .split("\n")
    .filter((l) => /^\w+=/.test(l))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const version = JSON.parse(readFileSync("package.json", "utf8")).version;

await build({
  entryPoints: ["mcp/server.ts"],
  outfile: "mcp/bundle/server/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  minify: true,
  legalComments: "none",
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
  define: {
    __SUPABASE_URL__: JSON.stringify(process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL),
    __SUPABASE_KEY__: JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY),
    __VERSION__: JSON.stringify(version),
  },
});

const manifest = JSON.parse(readFileSync("mcp/manifest.json", "utf8"));
manifest.version = version;
writeFileSync("mcp/bundle/manifest.json", JSON.stringify(manifest, null, 2));
writeFileSync("mcp/bundle/package.json", JSON.stringify({ type: "module" }));
writeFileSync("mcp/bundle/icon.png", readFileSync("src-tauri/icons/icon.png"));

mkdirSync("dist-mcp", { recursive: true });
execFileSync("npx", ["mcpb", "pack", "mcp/bundle", "dist-mcp/talaria.mcpb"], { stdio: "inherit" });

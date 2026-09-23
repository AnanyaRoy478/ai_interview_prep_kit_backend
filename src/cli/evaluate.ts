import "dotenv/config";
import fs from "node:fs/promises";
import { runPipeline } from "../pipeline/run";
import { CaseInput, BatchResult } from "../types";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const inputPath = arg("--input");
  const outputPath = arg("--output");
  if (!inputPath || !outputPath) throw new Error("Usage: npm run evaluate -- --input cases.json --output kits.json");

  const cases = JSON.parse(await fs.readFile(inputPath, "utf8")) as CaseInput[];
  const results: BatchResult[] = [];

  for (const c of cases) {
    try {
      const kit = await runPipeline(c);
      results.push({ id: c.id, status: "ok", kit, error: null });
    } catch (e:any) {
      results.push({
        id: c.id,
        status: "failed",
        kit: null,
        error: { code: e.code || "PIPELINE_FAILED", message: e.message || "Unknown error" }
      });
    }
  }

  await fs.writeFile(outputPath, JSON.stringify({
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: results
  }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });

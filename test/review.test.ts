import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("the local review saves only the selected proposal and rejects stale decisions", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mealie-review-"));
  const file = join(directory, "proposals.json");
  const recipe = {
    slug: "lemon-cake", name: "Lemon Cake", categories: ["Dessert"], tags: [],
    confidence: 0.95, reasoning: "A sweet cake.", approved: false,
  };
  const original = {
    generatedAt: "2026-01-01T00:00:00Z", mealieUrl: "https://mealie.example",
    taxonomy: { categories: ["Dessert"], tags: ["Make Ahead"] },
    classifications: [recipe, { ...recipe, slug: "lime-cake", name: "Lime Cake" }],
  };
  await writeFile(file, JSON.stringify(original));
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "review", "-i", file]);
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  t.after(async () => {
    child.kill();
    await closed;
    await rm(directory, { recursive: true, force: true });
  });
  const origin = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Review server did not start: ${output}`)), 10_000);
    child.once("close", () => {
      clearTimeout(timeout);
      reject(new Error(`Review server exited: ${output}`));
    });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const url = /http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0];
      if (url) {
        clearTimeout(timeout);
        resolve(url);
      }
    });
  });

  const page = await fetch(origin);
  assert.match(await page.text(), /Classification review/);
  const endpoint = `${origin}/api/review`;
  const snapshot = await (await fetch(endpoint)).json();
  const decision = { categories: ["Dessert"], tags: ["Make Ahead"], approved: true };
  const save = (revision: string, changes = decision) => fetch(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ index: 0, revision, decision: changes }),
  });
  assert.equal((await save(snapshot.revision, { ...decision, tags: ["Unknown"] })).status, 400);
  const response = await save(snapshot.revision);
  assert.equal(response.status, 200);
  assert.equal((await save(snapshot.revision)).status, 409);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(saved.classifications, [{ ...recipe, ...decision }, original.classifications[1]]);
  const current = await response.json();
  assert.equal((await save(current.revision, { ...decision, approved: false })).status, 200);
  assert.equal(JSON.parse(await readFile(file, "utf8")).classifications[0].approved, false);
});

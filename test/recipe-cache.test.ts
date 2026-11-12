import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { RecipeCache } from "../src/recipe-cache.js";
import type { Recipe } from "../src/types.js";

test("recipe details persist across runs and reload when the Mealie revision changes", async t => {
  const directory = await mkdtemp(join(tmpdir(), "mealie-recipe-cache-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const url = "https://mealie.example";
  const token = "test-token";
  const summary = { id: "one", slug: "soup", name: "Soup", updatedAt: "2026-01-01T12:00:00.123456+00:00" };
  let details: Recipe = {
    ...summary, updatedAt: "2026-01-01T12:00:00.123456Z",
    recipeIngredient: [{ display: "Carrots" }],
  };
  const fetchRecipe = t.mock.fn(async () => details);
  const firstRun = new RecipeCache(url, token, directory);
  assert.equal((await firstRun.load(summary, fetchRecipe)).cached, false);

  const secondRun = new RecipeCache(url, token, directory);
  const tags = [{ id: "tag", name: "Soup" }];
  const hit = await secondRun.load({ ...summary, tags }, fetchRecipe);
  assert.equal(hit.cached, true);
  assert.deepEqual(hit.recipe.recipeIngredient, details.recipeIngredient);
  assert.deepEqual(hit.recipe.tags, tags);
  assert.equal(fetchRecipe.mock.callCount(), 1);

  const edited = { ...summary, updatedAt: "2026-01-01T12:00:00.123457Z" };
  details = { ...details, updatedAt: edited.updatedAt, recipeIngredient: [{ display: "Onions" }] };
  assert.deepEqual(await secondRun.load(edited, fetchRecipe), { recipe: details, cached: false });
  assert.equal((await secondRun.load(edited, fetchRecipe, true)).cached, false);
  assert.equal((await new RecipeCache(url, "other-token", directory).load(edited, fetchRecipe)).cached, false);
  assert.equal((await secondRun.load({ ...edited, updatedAt: null }, fetchRecipe)).cached, false);
  assert.equal(fetchRecipe.mock.callCount(), 5);
});

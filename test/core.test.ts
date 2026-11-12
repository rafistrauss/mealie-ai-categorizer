import assert from "node:assert/strict";
import test from "node:test";
import { applyClassification, resolveOrganizers } from "../src/core.js";

const dessert = { id: "cat-1", name: "Dessert", description: "kept intact" };
const noBake = { id: "tag-1", name: "No Bake", extras: {} };

test("organizers resolve case-insensitively and retain full Mealie objects", () => {
  assert.deepEqual(resolveOrganizers(["dessert"], [dessert], "category"), [dessert]);
});

test("unknown organizers fail before an API update", () => {
  assert.throws(() => resolveOrganizers(["Deserts"], [dessert], "category"), /Unknown category/);
});

test("classification only replaces organizer arrays", () => {
  const recipe = { slug: "cake", name: "Cake", recipeIngredient: [{ display: "flour" }], custom: 42 };
  const result = applyClassification(recipe, {
    slug: "cake", name: "Cake", categories: ["Dessert"], tags: ["No Bake"], confidence: 1, reasoning: "test", approved: true,
  }, [dessert], [noBake]);
  assert.equal(result.custom, 42);
  assert.deepEqual(result.recipeCategory, [dessert]);
  assert.deepEqual(result.tags, [noBake]);
});

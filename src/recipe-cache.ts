import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Recipe } from "./types.js";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function revision(recipe: Recipe) {
  // Mealie can serialize the same UTC timestamp as either Z or +00:00.
  return typeof recipe.updatedAt === "string" && recipe.updatedAt
    ? recipe.updatedAt.replace(/\+00:00$/, "Z")
    : undefined;
}

export class RecipeCache {
  private readonly directory: string;

  constructor(url: string, token: string, root = ".mealie-cache") {
    this.directory = join(root, "v1", hash(JSON.stringify([url, token])));
  }

  async load(summary: Recipe, fetchRecipe: () => Promise<Recipe>, refresh = false) {
    const updatedAt = revision(summary);
    if (!summary.id || !updatedAt) return { recipe: await fetchRecipe(), cached: false };
    const path = join(this.directory, hash(summary.slug) + ".json");
    const matches = (recipe: Recipe | null) =>
      recipe?.slug === summary.slug && recipe.id === summary.id && revision(recipe) === updatedAt;

    if (!refresh) {
      try {
        const cached = JSON.parse(await readFile(path, "utf8")) as Recipe | null;
        if (cached && matches(cached)) {
          return {
            recipe: {
              ...cached,
              recipeCategory: summary.recipeCategory ?? cached.recipeCategory,
              tags: summary.tags ?? cached.tags,
            },
            cached: true,
          };
        }
      } catch {
        // Missing, unreadable, or invalid entries are cache misses.
      }
    }

    const recipe = await fetchRecipe();
    // A recipe can change between listing it and fetching its details.
    if (matches(recipe)) {
      const temporary = path + "." + randomUUID() + ".tmp";
      try {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        await writeFile(temporary, JSON.stringify(recipe), { flag: "wx", mode: 0o600 });
        await rename(temporary, path);
      } catch {
        // A cache write failure should not prevent classification.
        await rm(temporary, { force: true }).catch(() => {});
      }
    }
    return { recipe, cached: false };
  }
}

import type { Classification, Organizer, Recipe } from "./types.js";

export function organizerMap(items: Organizer[]): Map<string, Organizer> {
  return new Map(items.map((item) => [item.name.toLocaleLowerCase(), item]));
}

export function resolveOrganizers(names: string[], available: Organizer[], kind: string): Organizer[] {
  const byName = organizerMap(available);
  return names.map((name) => {
    const found = byName.get(name.toLocaleLowerCase());
    if (!found) throw new Error(`Unknown ${kind} in review file: ${name}`);
    return found;
  });
}

export function applyClassification(
  recipe: Recipe,
  classification: Classification,
  categories: Organizer[],
  tags: Organizer[],
): Recipe {
  return {
    ...recipe,
    recipeCategory: resolveOrganizers(classification.categories, categories, "category"),
    tags: resolveOrganizers(classification.tags, tags, "tag"),
  };
}

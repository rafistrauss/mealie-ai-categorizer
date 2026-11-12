export type Organizer = {
  id: string;
  name: string;
  [key: string]: unknown;
};

export type Ingredient = {
  display?: string | null;
  note?: string | null;
  food?: { name?: string | null } | null;
};

export type Instruction = { text?: string | null };

export type Recipe = {
  slug: string;
  name: string;
  description?: string | null;
  recipeCategory?: Organizer[];
  tags?: Organizer[];
  recipeIngredient?: Ingredient[];
  recipeInstructions?: Instruction[];
  [key: string]: unknown;
};

export type Classification = {
  slug: string;
  name: string;
  categories: string[];
  tags: string[];
  confidence: number;
  reasoning: string;
  approved: boolean;
};

export type ClassificationFile = {
  generatedAt: string;
  mealieUrl: string;
  taxonomy: { categories: string[]; tags: string[] };
  classifications: Classification[];
};

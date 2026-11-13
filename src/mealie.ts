import type { Organizer, Recipe } from "./types.js";

type Page<T> = { items?: T[] } | T[];

export class MealieError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class MealieClient {
  constructor(private baseUrl: string, private token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new MealieError(`Mealie ${init.method ?? "GET"} ${path} failed (${response.status}): ${body.slice(0, 1000)}`, response.status);
    }
    return (await response.json()) as T;
  }

  private items<T>(page: Page<T>): T[] {
    return Array.isArray(page) ? page : (page.items ?? []);
  }

  async listRecipes(): Promise<Recipe[]> {
    return this.items(await this.request<Page<Recipe>>("/api/recipes?perPage=-1"));
  }

  getRecipe(slug: string): Promise<Recipe> {
    return this.request(`/api/recipes/${encodeURIComponent(slug)}`);
  }

  async listCategories(): Promise<Organizer[]> {
    return this.items(await this.request<Page<Organizer>>("/api/organizers/categories?perPage=-1"));
  }

  async listTags(): Promise<Organizer[]> {
    return this.items(await this.request<Page<Organizer>>("/api/organizers/tags?perPage=-1"));
  }

  updateRecipe(recipe: Recipe): Promise<Recipe> {
    return this.request(`/api/recipes/${encodeURIComponent(recipe.slug)}`, {
      method: "PUT",
      body: JSON.stringify(recipe),
    });
  }
}

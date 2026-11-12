# Mealie AI Categorizer

Safely proposes categories and tags for an existing Mealie collection, using Gemini and only organizers that already exist in your Mealie database.

## Safety model

- `classify` only reads Mealie and writes `classifications.json` locally.
- Every proposal starts with `"approved": false`.
- `apply` changes only recipes you manually mark `"approved": true`.
- By default, `apply` skips recipes that already have any categories or tags.
- Organizer names are resolved to the full live Mealie objects (including IDs) immediately before each update.
- The complete recipe is fetched immediately before updating; all non-organizer fields are preserved.

Take a Mealie backup before the first apply run anyway.

## Setup

Requires Node.js 20 or newer.

```bash
cp .env.example .env
npm install
```

Fill in `.env`:

- `MEALIE_URL`: your instance URL, with no `/api` suffix.
- `MEALIE_TOKEN`: a long-lived token from your Mealie user profile.
- `GEMINI_API_KEY`: your Gemini API key, created in [Google AI Studio](https://aistudio.google.com/app/apikey).
- `GEMINI_MODEL`: defaults to `gemini-2.5-flash`; change it if necessary for your Gemini API account.

## Recommended first run

Test two recipes:

```bash
npm run classify -- --limit 2
```

Start the local review UI:

```bash
npm run review
```

Open the URL printed in your terminal. Search by recipe or label, filter by approval status, or sort by lowest confidence. Select a recipe to inspect the AI reasoning and adjust categories and tags using the taxonomy saved with the proposals. **Approve & next** saves the decision and moves to the next matching unapproved recipe. **Save edits** keeps the current approval status, and **Revoke approval** removes an approval.

The UI saves changes to the local review file. Once you're ready to update Mealie, run:

```bash
npm run apply
```

For a custom review file, use the same path with both commands:

```bash
npm run review -- --input batch.json
npm run apply -- --input batch.json
```

Run the full collection after the test succeeds:

```bash
npm run classify
```

You can also target one or more slugs:

```bash
npm run classify -- --slug lemon-blueberry-lasagna --slug another-recipe
```

If you intentionally want approved results to replace existing organizers:

```bash
npm run apply -- --replace-existing
```

## Using Bun

Install dependencies with `bun install`, then run the TypeScript CLI directly with Bun:

```bash
bun src/cli.ts classify --limit 2
bun src/cli.ts review
bun src/cli.ts apply
```

For a custom review file, pass `--input batch.json` to both `review` and `apply`.

## Review file

Each entry looks like this:

```json
{
  "slug": "lemon-blueberry-lasagna",
  "name": "Lemon Blueberry Lasagna",
  "categories": ["Dessert"],
  "tags": ["No Bake", "Make Ahead"],
  "confidence": 0.97,
  "reasoning": "A chilled, no-bake layered sweet dish.",
  "approved": false
}
```

Edit category/tag names if necessary, but they must exactly match existing Mealie organizers (matching is case-insensitive). A typo causes the apply run to stop before that recipe is updated.

## Taxonomy audit

Before classification, you may want an AI report about missing labels and duplicates:

```bash
npm run taxonomy
```

This writes `taxonomy-report.json` and never changes Mealie. Create or merge organizers yourself, then run `classify` against the cleaned taxonomy.

## Checks

```bash
npm run typecheck
npm test
```

## Notes

- The script classifies sequentially to avoid hammering either API and to make progress/errors obvious.
- Ingredient and instruction text is explicitly treated as untrusted content in the classifier prompt.
- If your installed Mealie version exposes different endpoint paths, compare `src/mealie.ts` with the interactive API documentation at `https://your-mealie-host/docs`.

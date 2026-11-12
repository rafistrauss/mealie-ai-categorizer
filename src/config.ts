import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  MEALIE_URL: z.string().url(),
  MEALIE_TOKEN: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
});

export function config(needsGemini = false) {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  if (needsGemini && !parsed.data.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for classify and taxonomy.");
  }
  return { ...parsed.data, MEALIE_URL: parsed.data.MEALIE_URL.replace(/\/$/, "") };
}

import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { z } from "zod";

const Decision = z.object({
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  approved: z.boolean(),
});

export const ReviewFile = z.object({
  generatedAt: z.string(),
  mealieUrl: z.string(),
  taxonomy: z.object({ categories: z.array(z.string()), tags: z.array(z.string()) }).passthrough(),
  classifications: z.array(Decision.extend({
    slug: z.string(), name: z.string(), confidence: z.number(), reasoning: z.string(),
  }).passthrough()),
}).passthrough();

const Update = z.object({
  revision: z.string(),
  index: z.number().int().nonnegative(),
  decision: Decision,
});

function revisionOf(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

const host = "127.0.0.1";
const assets = {
  "/": ["index.html", "text/html"],
  "/review.css": ["review.css", "text/css"],
  "/review.js": ["review.js", "text/javascript"],
} as const;

export async function startReview(input: string) {
  const file = resolve(input);
  const readReview = async () => {
    const content = await readFile(file, "utf8");
    return { review: ReviewFile.parse(JSON.parse(content)), revision: revisionOf(content) };
  };
  await readReview();

  let saving = false;
  const server = createServer(async (req, res) => {
    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    };
    const address = server.address();
    const expectedHost = typeof address === "object" && address ? `${host}:${address.port}` : "";
    if (req.headers.host !== expectedHost) return json(403, { error: "Open the local URL printed by the review command." });

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    try {
      if (req.method === "GET" && req.url === "/api/review") return json(200, await readReview());

      if (req.method === "PATCH" && req.url === "/api/review") {
        if (req.headers.origin !== `http://${expectedHost}` || req.headers["content-type"] !== "application/json") {
          return json(403, { error: "Save from the local review page." });
        }
        let body = "";
        for await (const chunk of req.setEncoding("utf8")) {
          body += chunk;
          if (body.length > 1024 * 1024) return json(413, { error: "This update is too large." });
        }
        let payload: unknown;
        try { payload = JSON.parse(body); } catch { return json(400, { error: "Invalid JSON." }); }
        const update = Update.safeParse(payload);
        if (!update.success) return json(400, { error: "Invalid proposal update." });
        if (saving) return json(409, { error: "Another save is in progress. Try again." });

        saving = true;
        try {
          const { review, revision } = await readReview();
          const { index, decision } = update.data;
          if (revision !== update.data.revision) return json(409, { error: "The review file changed. Reload this page before saving again." });
          const proposal = review.classifications[index];
          if (!proposal) return json(404, { error: "Proposal not found." });

          for (const kind of ["categories", "tags"] as const) {
            const available = new Set([...review.taxonomy[kind], ...proposal[kind]].map((name) => name.toLocaleLowerCase()));
            if (decision[kind].some((name) => !available.has(name.toLocaleLowerCase()))) {
              return json(400, { error: `Choose ${kind} from the review file's taxonomy.` });
            }
          }
          Object.assign(proposal, decision);
          const content = `${JSON.stringify(review, null, 2)}\n`;
          const temporary = `${file}.${randomUUID()}.tmp`;
          try {
            await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
            if (revisionOf(await readFile(file, "utf8")) !== revision) {
              return json(409, { error: "The review file changed. Reload this page before saving again." });
            }
            await rename(temporary, file);
          } finally {
            await rm(temporary, { force: true });
          }
          return json(200, { revision: revisionOf(content) });
        } finally {
          saving = false;
        }
      }

      if (req.method === "GET" && req.url && Object.hasOwn(assets, req.url)) {
        const [name, type] = assets[req.url as keyof typeof assets];
        const content = await readFile(new URL(`./review/${name}`, import.meta.url));
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
        return res.end(content);
      }
      return json(404, { error: "Page not found." });
    } catch (error) {
      console.error(error);
      return json(500, { error: "Could not read or save the review file. Check the review command's terminal." });
    }
  });
  await new Promise<void>((ready, reject) => {
    server.once("error", reject);
    server.listen(0, host, ready);
  });
  const address = server.address();
  if (address && typeof address === "object") {
    console.log(`Reviewing ${file}\nOpen http://${host}:${address.port} in your browser. Press Ctrl+C to stop.`);
  }
}

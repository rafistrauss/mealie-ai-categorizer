import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Classifier } from "../src/classifier.js";

const recipe = { slug: "mock-recipe", name: "Mock recipe" };
const result = { categories: [], tags: [], confidence: 1, reasoning: "Mock result" };

function mockFetch(t: TestContext, implementation: () => Promise<Response>) {
  const original = globalThis.fetch;
  const mocked = t.mock.fn(implementation);
  globalThis.fetch = mocked;
  t.after(() => { globalThis.fetch = original; });
  return mocked;
}

function quotaResponse(quotaId: string) {
  return Response.json({
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "Quota exceeded. Please retry in 0.03s.",
      details: [
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "0.01s" },
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId }] },
      ],
    },
  }, { status: 429 });
}

test("Gemini retries the same classification after the longer advertised delay", async t => {
  const starts: number[] = [];
  t.mock.method(console, "warn", () => {});
  mockFetch(t, async () => {
    starts.push(performance.now());
    if (starts.length === 1) return quotaResponse("GenerateRequestsPerMinutePerProjectPerModel-FreeTier");
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
  });
  const classifier = new Classifier("test-key", "test-model");
  assert.deepEqual(await classifier.classify(recipe, ["Dinner"], ["Soup"]), { ...recipe, ...result, approved: false });
  assert.equal(starts.length, 2);
  assert.ok(starts[1]! - starts[0]! >= 30);
});

test("Gemini stops immediately for daily quotas and caps retries for minute quotas", async t => {
  t.mock.method(console, "warn", () => {});
  let quotaId = "GenerateRequestsPerDayPerProjectPerModel-FreeTier";
  const fetch = mockFetch(t, async () => quotaResponse(quotaId));
  const classifier = new Classifier("test-key", "test-model");
  await assert.rejects(classifier.classify(recipe, [], []), { status: 429 });
  assert.equal(fetch.mock.callCount(), 1);

  quotaId = "GenerateRequestsPerMinutePerProjectPerModel-FreeTier";
  await assert.rejects(classifier.classify(recipe, [], []), { status: 429 });
  assert.equal(fetch.mock.callCount(), 4);
});

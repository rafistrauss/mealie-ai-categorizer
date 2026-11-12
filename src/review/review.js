const element = (id) => document.getElementById(id);
const queue = element("queue");
const form = element("proposal");
const feedback = element("feedback");
const kinds = ["categories", "tags"];
const drafts = new Map();
let review;
let revision;
let selected;
let saving = false;

const confidence = (item) => `${Math.round(item.confidence * 100)}% confidence`;
const status = (item) => item.approved ? "Approved" : "Not approved";

function visibleRecipes() {
  const term = element("search").value.trim().toLocaleLowerCase();
  const filter = element("status").value;
  const sort = element("sort").value;
  const entries = review.classifications.map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const matchesStatus = filter === "all" || item.approved === (filter === "approved");
      return matchesStatus && [item.name, item.slug, ...item.categories, ...item.tags]
        .some((value) => value.toLocaleLowerCase().includes(term));
    });
  if (sort === "confidence") entries.sort((a, b) => a.item.confidence - b.item.confidence);
  if (sort === "name") entries.sort((a, b) => a.item.name.localeCompare(b.item.name));
  return entries;
}

function renderQueue(entries = visibleRecipes()) {
  const total = review.classifications.length;
  const approved = review.classifications.filter((item) => item.approved).length;
  element("count").textContent = `${approved} of ${total} approved`;
  element("progress").max = total || 1;
  element("progress").value = approved;
  element("results").textContent = entries.length ? `${entries.length} shown` : "No matching recipes";

  const scrollTop = queue.scrollTop;
  queue.replaceChildren(...entries.map(({ item, index }) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row";
    button.disabled = saving;
    if (index === selected) button.setAttribute("aria-current", "true");
    const summary = document.createElement("small");
    summary.textContent = `${status(item)} · ${confidence(item)}${drafts.has(index) ? " · Unsaved edits" : ""}`;
    button.append(item.name, summary);
    button.addEventListener("click", () => {
      select(index);
      element("recipe").focus();
    });
    row.append(button);
    return row;
  }));
  queue.scrollTop = scrollTop;
}

function renderChoices(kind, item, draft) {
  const fieldset = element(kind);
  const group = document.createElement("div");
  group.className = "choices";
  const picked = new Set(draft[kind].map((name) => name.toLocaleLowerCase()));
  const choices = new Map();
  for (const name of [...item[kind], ...review.taxonomy[kind]]) {
    const key = name.toLocaleLowerCase();
    if (!choices.has(key)) choices.set(key, name);
  }
  const names = [...choices.entries()].sort(([a], [b]) =>
    Number(picked.has(b)) - Number(picked.has(a)) || a.localeCompare(b));
  for (const [key, name] of names) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = name;
    checkbox.checked = picked.has(key);
    const label = document.createElement("label");
    label.className = "choice";
    label.append(checkbox, name);
    group.append(label);
  }
  if (!names.length) group.textContent = "No options in this review file.";
  fieldset.querySelector(".choices")?.remove();
  fieldset.append(group);
}

function select(index) {
  selected = index;
  renderQueue();
  const item = review.classifications[index];
  form.hidden = !item;
  element("empty").hidden = Boolean(item);
  feedback.textContent = drafts.has(index) ? "Unsaved edits" : "";
  feedback.classList.remove("error");
  if (!item) {
    element("empty").textContent = review.classifications.length
      ? "No recipes match these filters." : "This file contains no proposals.";
    return;
  }
  element("recipe").textContent = item.name;
  element("reason").textContent = item.reasoning || "No reasoning provided.";
  element("confidence").textContent = confidence(item);
  element("badge").textContent = status(item);
  element("badge").classList.toggle("approved", item.approved);
  element("approve").hidden = item.approved;
  element("undo").hidden = !item.approved;
  element("save").disabled = !drafts.has(index);
  for (const kind of kinds) renderChoices(kind, item, drafts.get(index) ?? item);
}

function updateFilter() {
  if (saving) return;
  const entries = visibleRecipes();
  if (entries.some(({ index }) => index === selected)) renderQueue(entries);
  else select(entries[0]?.index);
}

function collectLabels() {
  return Object.fromEntries(kinds.map((kind) => [
    kind, [...element(kind).querySelectorAll("input:checked")].map((input) => input.value),
  ]));
}

form.addEventListener("change", () => {
  const labels = collectLabels();
  const item = review.classifications[selected];
  const unchanged = kinds.every((kind) => {
    const original = new Set(item[kind].map((name) => name.toLocaleLowerCase()));
    return original.size === labels[kind].length && labels[kind].every((name) => original.has(name.toLocaleLowerCase()));
  });
  if (unchanged) drafts.delete(selected);
  else drafts.set(selected, labels);
  element("save").disabled = unchanged;
  feedback.classList.remove("error");
  feedback.textContent = unchanged ? "" : "Unsaved edits";
  renderQueue();
});

function setSaving(value) {
  saving = value;
  for (const kind of kinds) element(kind).disabled = value;
  for (const id of ["search", "status", "sort", "approve", "undo"]) element(id).disabled = value;
  element("save").disabled = value || !drafts.has(selected);
  renderQueue();
}

async function save(approved, advance = false) {
  if (saving || selected === undefined) return;
  const index = selected;
  const item = review.classifications[index];
  const wasApproved = item.approved;
  const decision = {
    categories: item.categories,
    tags: item.tags,
    ...drafts.get(index),
    approved,
  };
  const before = visibleRecipes();
  const position = before.findIndex((entry) => entry.index === index);
  const pending = [...before.slice(position + 1), ...before.slice(0, position)]
    .find((entry) => !entry.item.approved);
  setSaving(true);
  feedback.classList.remove("error");
  feedback.textContent = "Saving…";
  try {
    const response = await fetch("/api/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision, index, decision }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    revision = result.revision;
    Object.assign(item, decision);
    drafts.delete(index);
    const entries = visibleRecipes();
    const next = advance && pending ? pending.index : index;
    select(entries.some((entry) => entry.index === next) ? next : entries[0]?.index);
    if (advance) feedback.textContent = `Approved ${item.name}.`;
    else if (wasApproved && !approved) feedback.textContent = `Revoked approval for ${item.name}.`;
    else feedback.textContent = "Saved to review file.";
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add("error");
  } finally {
    setSaving(false);
    if (advance && !feedback.classList.contains("error")) {
      element(selected === undefined ? "status" : "recipe").focus();
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!review.classifications[selected]?.approved) void save(true, true);
});
element("save").addEventListener("click", () => void save(review.classifications[selected].approved));
element("undo").addEventListener("click", () => void save(false));
element("search").addEventListener("input", updateFilter);
element("status").addEventListener("change", updateFilter);
element("sort").addEventListener("change", updateFilter);
window.addEventListener("beforeunload", (event) => {
  if (drafts.size || saving) {
    event.preventDefault();
    event.returnValue = "";
  }
});

try {
  const response = await fetch("/api/review");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  ({ review, revision } = result);
  element("workspace").hidden = false;
  element("next-step").hidden = false;
  select(review.classifications.length ? 0 : undefined);
} catch (error) {
  element("count").textContent = "Review unavailable";
  element("notice").textContent = error.message;
  element("notice").hidden = false;
}

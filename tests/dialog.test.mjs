import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workflow dialog cancel controls bypass validation and close the dialog", async () => {
  const [html, javascript] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
  ]);
  const workflowDialog = html.match(/<dialog class="workflow-dialog" id="workflow-dialog"[\s\S]*?<\/dialog>/)?.[0];

  assert.ok(workflowDialog);
  assert.equal((workflowDialog.match(/type="button" value="cancel"/g) ?? []).length, 2);
  assert.match(javascript, /querySelectorAll\("\[value='cancel'\]"\)[\s\S]*?dialog\.close\(\)/);
});

test("user creation requires a canonical UUID before submitting", async () => {
  const javascript = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const pattern = javascript.match(/name="actorId" required pattern="([^"]+)"/)?.[1];

  assert.ok(pattern);
  const uuid = new RegExp(`^(?:${pattern})$`);
  assert.equal(uuid.test("10001"), false);
  assert.equal(uuid.test("12345678-1234-4123-8123-123456789abc"), true);
});

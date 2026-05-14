import test from "node:test";
import assert from "node:assert/strict";
import { canUserAccessReport } from "../src/lib/report/access.ts";

test("report ownership check allows only the owner", () => {
  assert.equal(canUserAccessReport("user-1", { user_id: "user-1" }), true);
  assert.equal(canUserAccessReport("user-2", { user_id: "user-1" }), false);
  assert.equal(canUserAccessReport(null, { user_id: "user-1" }), false);
  assert.equal(canUserAccessReport("user-1", null), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { displayValue, safeArray } from "./review-display";

test("displayValue renders objects safely", () => {
  assert.equal(displayValue({ group_mismatch: 4 }), "{\"group_mismatch\":4}");
});

test("displayValue renders object rawGroup safely", () => {
  assert.equal(displayValue({ text: "孙导组" }), "{\"text\":\"孙导组\"}");
});

test("displayValue renders array rawDirectorGroup safely", () => {
  assert.equal(displayValue(["孙导组"]), "[\"孙导组\"]");
});

test("safeArray keeps empty pending arrays safe", () => {
  assert.deepEqual(safeArray([]), []);
});

test("safeArray falls back when hiddenRecords is missing", () => {
  assert.deepEqual(safeArray(undefined), []);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("review page keeps detailed diagnostics inside a details block", () => {
  const source = readFileSync("src/app/review/page.tsx", "utf8");

  assert.match(source, /<details/);
  assert.match(source, /<summary>诊断信息<\/summary>/);
});

test("review page top diagnostics only show a short summary", () => {
  const source = readFileSync("src/app/review/page.tsx", "utf8");

  assert.match(source, /日报总数 .*\/ 待审核/);
  assert.match(source, /当前导演暂无可审核日报/);
});

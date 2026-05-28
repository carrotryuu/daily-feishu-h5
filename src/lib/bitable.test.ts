import assert from "node:assert/strict";
import test from "node:test";
import { extractFeishuBaseRef } from "./bitable";

test("extracts wiki node token from a Wiki bitable URL", () => {
  assert.deepEqual(
    extractFeishuBaseRef("https://example.feishu.cn/wiki/wikcnABC123?table=tblxxx"),
    { type: "wiki", token: "wikcnABC123" }
  );
});

test("keeps normal base URLs compatible", () => {
  assert.deepEqual(
    extractFeishuBaseRef("https://example.feishu.cn/base/appABC123?table=tblxxx"),
    { type: "base", token: "appABC123" }
  );
});

test("accepts raw app tokens", () => {
  assert.deepEqual(extractFeishuBaseRef("bascnABC123"), {
    type: "token",
    token: "bascnABC123"
  });
});

test("accepts raw wiki node tokens", () => {
  assert.deepEqual(extractFeishuBaseRef("wikcnABC123"), {
    type: "wiki",
    token: "wikcnABC123"
  });
});

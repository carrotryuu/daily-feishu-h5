import assert from "node:assert/strict";
import test from "node:test";
import { classifyFeishuBaseAppToken, maskSecret } from "./oauth-debug";

test("masks long secrets with only the first and last four characters visible", () => {
  assert.equal(maskSecret("abcd12345678wxyz"), "abcd***wxyz");
});

test("classifies supported Feishu base token formats", () => {
  assert.equal(
    classifyFeishuBaseAppToken("https://example.feishu.cn/wiki/wikcnABC123"),
    "wiki_url"
  );
  assert.equal(
    classifyFeishuBaseAppToken("https://example.feishu.cn/base/bascnABC123"),
    "base_url"
  );
  assert.equal(classifyFeishuBaseAppToken("bascnABC123"), "raw_token");
});

test("marks malformed pasted env assignments as unknown base token format", () => {
  assert.equal(classifyFeishuBaseAppToken("FEISHU_BASE_APP_TOKEN=bascnABC123"), "unknown");
});

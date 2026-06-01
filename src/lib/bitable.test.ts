import assert from "node:assert/strict";
import test from "node:test";
import { extractFeishuBaseRef, resolveBitableRecordFields } from "./bitable";

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

test("resolves Feishu single select option ids to option names", () => {
  const fields = resolveBitableRecordFields(
    "daily",
    {
      record_id: "rec_1",
      fields: {
        所属小组: "opt_sun",
        日报状态: { id: "opt_pending" }
      }
    },
    {
      fieldNames: new Set(["所属小组", "日报状态"]),
      optionNameByField: {
        所属小组: { opt_sun: "孙导组" },
        日报状态: { opt_pending: "待审核" }
      }
    }
  );

  assert.equal(fields["所属小组"], "孙导组");
  assert.equal(fields["日报状态"], "待审核");
});

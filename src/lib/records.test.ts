import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveBitableRecordFields,
  type TableFieldMeta
} from "./bitable";
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUS,
  DAILY_STATUS,
  DAILY_TYPES,
  ROLES,
  TABLE_FIELDS,
  YES_NO
} from "./constants";
import {
  mapAccount,
  mapDaily,
  mapPerson,
  toAccountFields,
  toDailyFields
} from "./records";

test("maps account startCredits from supported Feishu field aliases", () => {
  assert.equal(mapAccount({ 起始积分: 11 }).startCredits, 11);
  assert.equal(mapAccount({ 初始积分: 22 }).startCredits, 22);
  assert.equal(mapAccount({ 账号起始积分: 33 }).startCredits, 33);
  assert.equal(mapAccount({ startCredits: 44 }).startCredits, 44);
});

test("maps account bound user and name from supported Feishu aliases", () => {
  const account = mapAccount({
    绑定用户ID: "u_current",
    绑定人员: "张三"
  });

  assert.equal(account.userId, "u_current");
  assert.equal(account.animatorName, "张三");
});

test("maps resolved people group option name", () => {
  const person = mapPerson({
    [TABLE_FIELDS.people.userId]: "director_1",
    [TABLE_FIELDS.people.name]: "孙导",
    [TABLE_FIELDS.people.role]: ROLES.director,
    [TABLE_FIELDS.people.group]: "孙导组",
    [TABLE_FIELDS.people.enabled]: YES_NO.yes
  });

  assert.equal(person.group, "孙导组");
});

test("maps people group option id to Sun group after bitable resolution", () => {
  const meta: TableFieldMeta = {
    fieldNames: new Set([TABLE_FIELDS.people.group]),
    optionNameByField: {
      [TABLE_FIELDS.people.group]: { opt_sun: "孙导组" }
    }
  };
  const fields = resolveBitableRecordFields(
    "people",
    {
      record_id: "person_1",
      fields: {
        [TABLE_FIELDS.people.userId]: "director_1",
        [TABLE_FIELDS.people.name]: "孙导",
        [TABLE_FIELDS.people.role]: ROLES.director,
        [TABLE_FIELDS.people.group]: "opt_sun",
        [TABLE_FIELDS.people.enabled]: YES_NO.yes
      }
    },
    meta
  );
  const person = mapPerson(fields);

  assert.equal(person.group, "孙导组");
});

test("maps resolved account type option name", () => {
  const account = mapAccount({
    [TABLE_FIELDS.accounts.accountName]: "赵国微生产账号",
    [TABLE_FIELDS.accounts.platform]: "LIBTV",
    [TABLE_FIELDS.accounts.accountType]: ACCOUNT_TYPES.personal,
    [TABLE_FIELDS.accounts.accountStatus]: "启用"
  });

  assert.equal(account.accountName, "赵国微生产账号");
  assert.equal(account.accountType, ACCOUNT_TYPES.personal);
});

test("maps accountName only from 账号 field", () => {
  assert.equal(
    mapAccount({
      账号: "标准账号",
      账号名称: "旧字段账号"
    }).accountName,
    "标准账号"
  );
  assert.equal(mapAccount({ 账号名称: "旧字段账号" }).accountName, "");
});

test("writes accountName to 账号 field", () => {
  const fields = toAccountFields({
    group: "孙导组",
    platform: "LIBTV",
    accountName: "赵国微生产账号",
    accountType: ACCOUNT_TYPES.personal,
    accountStatus: ACCOUNT_STATUS.enabled
  });

  assert.equal(fields["账号"], "赵国微生产账号");
  assert.equal("账号名称" in fields, false);
});

test("maps other period content from daily fields", () => {
  const daily = mapDaily({
    [TABLE_FIELDS.daily.nonProductionNote]: "筹备说明"
  });

  assert.equal(daily.dailyType, DAILY_TYPES.other);
  assert.equal(daily.nonProductionNote, "筹备说明");
});

test("maps resolved daily group option name", () => {
  const daily = mapDaily({
    [TABLE_FIELDS.daily.group]: "孙导组",
    [TABLE_FIELDS.daily.status]: DAILY_STATUS.pending
  });

  assert.equal(daily.group, "孙导组");
  assert.equal(daily.status, DAILY_STATUS.pending);
});

test("maps daily group option id to Sun group after bitable resolution", () => {
  const meta: TableFieldMeta = {
    fieldNames: new Set([TABLE_FIELDS.daily.group]),
    optionNameByField: {
      [TABLE_FIELDS.daily.group]: { opt_sun: "孙导组" }
    }
  };
  const fields = resolveBitableRecordFields(
    "daily",
    {
      record_id: "daily_1",
      fields: {
        [TABLE_FIELDS.daily.group]: "opt_sun",
        [TABLE_FIELDS.daily.status]: DAILY_STATUS.pending
      }
    },
    meta
  );
  const daily = mapDaily(fields);

  assert.equal(daily.group, "孙导组");
});

test("infers other daily type when type field is empty but other period content exists", () => {
  const daily = mapDaily({
    [TABLE_FIELDS.daily.nonProductionNote]: "历史非生产说明"
  });

  assert.equal(daily.dailyType, DAILY_TYPES.other);
  assert.equal(daily.nonProductionNote, "历史非生产说明");
});

test("maps status and group when Feishu returns option-like objects", () => {
  const daily = mapDaily({
    [TABLE_FIELDS.daily.status]: { text: DAILY_STATUS.pending },
    [TABLE_FIELDS.daily.group]: { text: "A组" }
  });

  assert.equal(daily.status, DAILY_STATUS.pending);
  assert.equal(daily.group, "A组");
});

test("writes other period content without requiring daily type field", () => {
  const fields = toDailyFields({
    dailyType: DAILY_TYPES.retrospective,
    date: "2026-05-27",
    userId: "animator_1",
    name: "动画师",
    group: "A组",
    changedAccount: YES_NO.no,
    account: "",
    platform: "",
    accountType: "",
    previousCredits: 0,
    newAccountStartCredits: 0,
    remainingCredits: 0,
    consumedCredits: 0,
    assetCount: 0,
    roughCutSeconds: 0,
    hasIssue: YES_NO.no,
    issueNote: "",
    nonProductionNote: "复盘说明",
    status: DAILY_STATUS.pending,
    includeRanking: YES_NO.no,
    month: "2026-05",
    submittedAt: "2026-05-27T10:00:00.000Z"
  });

  assert.equal("日报类型" in fields, false);
  assert.equal(fields[TABLE_FIELDS.daily.nonProductionNote], "复盘说明");
});

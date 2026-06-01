"use client";

import { FormEvent, useEffect, useState } from "react";

type PendingDaily = {
  recordId: string;
  dailyId: string;
  dailyType: string;
  date: string;
  name: string;
  group: string;
  account: string;
  platform: string;
  accountType: string;
  previousCredits: number;
  remainingCredits: number;
  consumedCredits: number;
  assetCount: number;
  roughCutSeconds: number;
  hasIssue: string;
  issueNote: string;
  nonProductionNote: string;
  status: string;
  includeRanking: string;
  submittedAt: string;
};

type ReviewDebug = {
  totalDailyRecords: number;
  pendingRecords: number;
  visibleRecords: number;
  hiddenReasonsSummary: Record<string, number>;
};

type ReviewData = {
  user: {
    userId: string;
    name: string;
    role: string;
    group: string;
    enabled: string;
  };
  pending: PendingDaily[];
  debug?: ReviewDebug;
};

type UserRecognitionDetails = {
  feishuOpenId?: string | null;
  feishuUserId?: string | null;
  matchedUserId?: string | null;
  matchedPeopleField?: string;
  peopleTableQueried?: boolean;
  peopleTableHasUserId?: boolean | null;
  enabled?: string | null;
  role?: string | null;
  devOpenIdConfigured?: boolean;
};

function formatError(payload: { error?: string; userRecognition?: UserRecognitionDetails }) {
  if (!payload.userRecognition) return payload.error || "";
  if (payload.error?.includes("matchedUserId：")) return payload.error;

  const details = payload.userRecognition;
  return [
    payload.error || "无法识别当前登录用户。",
    `feishu open_id：${details.feishuOpenId || "未获取到"}`,
    `feishu user_id：${details.feishuUserId || "未获取到"}`,
    `实际用于匹配人员表的 matchedUserId：${details.matchedUserId || "未获取到"}`,
    `人员表是否查询成功：${details.peopleTableQueried ? "是" : "否"}`,
    `人员表中是否存在该用户ID：${
      details.peopleTableHasUserId == null
        ? "无法判断"
        : details.peopleTableHasUserId
          ? "是"
          : "否"
    }`,
    `是否启用：${details.enabled || "未找到"}`,
    `角色字段值：${details.role || "未找到"}`,
    `匹配字段：人员表「${details.matchedPeopleField || "用户ID"}」`,
    `DEV_OPEN_ID 是否配置：${details.devOpenIdConfigured ? "是" : "否"}`
  ].join("\n");
}

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [selected, setSelected] = useState<PendingDaily | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    grade: "",
    note: "",
    markAbnormal: false,
    action: "approve",
    includeRanking: true
  });

  const isSelectedProduction = selected?.dailyType !== "生产日报" ? false : true;

  function selectDaily(row: PendingDaily) {
    const isProduction = row.dailyType === "生产日报";
    setSelected(row);
    setForm((current) => ({
      ...current,
      action: "approve",
      includeRanking: isProduction
    }));
  }

  async function load() {
    setError("");
    const meResponse = await fetch("/api/me");
    const mePayload = await meResponse.json().catch(() => ({}));
    if (!meResponse.ok) {
      setError(formatError(mePayload) || "无法识别当前登录用户");
      return;
    }

    const response = await fetch("/api/review");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatError(payload) || "无法读取审核数据");
      return;
    }
    setData({ ...payload, user: mePayload.user });
    setSelected((current) => current ?? payload.pending[0] ?? null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;

    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordId: selected.recordId,
        grade: form.grade,
        note: form.note,
        action: form.action,
        markAbnormal: form.action === "abnormal" || form.markAbnormal,
        includeRanking: isSelectedProduction && form.includeRanking
      })
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(payload.error || "审核提交失败");
      return;
    }

    setMessage("审核已提交");
    setSelected(null);
    setForm({
      grade: "",
      note: "",
      markAbnormal: false,
      action: "approve",
      includeRanking: true
    });
    await load();
  }

  return (
    <main className="page">
      <div className="page-title">
        <div>
          <h1>日报审核</h1>
          <p className="subtle">
            {data ? `${data.user.name} · ${data.user.role}` : "待审核日报"}
          </p>
        </div>
        <a className="button" href="/api/auth/login">
          飞书登录
        </a>
      </div>

      {error ? (
        <div className="notice error" style={{ whiteSpace: "pre-line" }}>
          {error}
        </div>
      ) : null}
      {message ? <div className="notice success">{message}</div> : null}
      {data && data.pending.length === 0 && data.debug ? (
        <div className="notice" style={{ whiteSpace: "pre-line" }}>
          {[
            `诊断：日报总数 ${data.debug.totalDailyRecords}`,
            `待审核 ${data.debug.pendingRecords}`,
            `当前可见 ${data.debug.visibleRecords}`,
            `隐藏原因 ${JSON.stringify(data.debug.hiddenReasonsSummary)}`
          ].join("\n")}
        </div>
      ) : null}

      <section className="grid">
        <div className="panel">
          <h2>待审核</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 110 }}>日期</th>
                  <th style={{ minWidth: 110 }}>类型</th>
                  <th style={{ minWidth: 110 }}>人员</th>
                  <th style={{ minWidth: 120 }}>所属小组</th>
                  <th style={{ minWidth: 160 }}>账号</th>
                  <th>平台</th>
                  <th style={{ minWidth: 140 }}>账号类型</th>
                  <th>昨日剩余积分</th>
                  <th>今日剩余积分</th>
                  <th>今日积分消耗</th>
                  <th>资产数量</th>
                  <th>视频时长（s）</th>
                  <th>生成问题</th>
                  <th>其他周期内容</th>
                  <th>状态</th>
                  <th>计入排行</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(data?.pending ?? []).map((row) => (
                  <tr key={row.recordId}>
                    <td>{row.date}</td>
                    <td>{row.dailyType || "生产日报"}</td>
                    <td>{row.name}</td>
                    <td>{row.group}</td>
                    <td>
                      {row.account || "-"}
                      <div className="subtle">{row.accountType || "非生产"}</div>
                    </td>
                    <td>{row.platform || "-"}</td>
                    <td>{row.accountType || "-"}</td>
                    <td>{row.previousCredits}</td>
                    <td>{row.remainingCredits}</td>
                    <td>{row.consumedCredits}</td>
                    <td>{row.assetCount}</td>
                    <td>{row.roughCutSeconds}</td>
                    <td>
                      {row.hasIssue || "-"}
                      {row.issueNote ? <div className="subtle">{row.issueNote}</div> : null}
                    </td>
                    <td>{row.nonProductionNote || "-"}</td>
                    <td>{row.status}</td>
                    <td>{row.includeRanking || "-"}</td>
                    <td>{row.submittedAt || "-"}</td>
                    <td>
                      <button type="button" onClick={() => selectDaily(row)}>
                        审核
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form className="panel form" onSubmit={submit}>
          <h2>审核详情</h2>
          {selected ? (
            <>
              <div className="notice">
                {selected.name} · {selected.date} · {selected.dailyType || "生产日报"}
                <br />
                <span className="subtle">
                  所属小组：{selected.group} · 日报状态：{selected.status}
                </span>
                <br />
                {isSelectedProduction ? (
                  <span className="subtle">
                    账号：{selected.account || "-"} · 平台：{selected.platform || "-"} ·
                    账号类型：{selected.accountType || "-"} · 昨日剩余积分：
                    {selected.previousCredits} · 今日剩余积分：{selected.remainingCredits} ·
                    今日积分消耗：{selected.consumedCredits} · 本日资产生成数量：
                    {selected.assetCount} · 本日视频粗剪时长（s）：
                    {selected.roughCutSeconds} · 是否存在生成问题：
                    {selected.hasIssue || "-"} {selected.issueNote} · 是否计入排行：
                    {selected.includeRanking || "-"} · 提交时间：{selected.submittedAt || "-"}
                  </span>
                ) : (
                  <span className="subtle">
                    其他周期内容：{selected.nonProductionNote || "-"}
                    <br />
                    提交时间：{selected.submittedAt || "-"}
                  </span>
                )}
              </div>
              <div className="field">
                <label>K 等级</label>
                <select
                  required
                  value={form.grade}
                  onChange={(event) =>
                    setForm({ ...form, grade: event.target.value })
                  }
                >
                  <option value="">请选择</option>
                  <option value="K1">K1 · 1.2</option>
                  <option value="K2">K2 · 1.0</option>
                  <option value="K3">K3 · 0.8</option>
                  <option value="K4">K4 · 0.5</option>
                  <option value="K5">K5 · 0.2</option>
                </select>
              </div>
              <div className="field">
                <label>审核结果</label>
                <select
                  value={form.action}
                  onChange={(event) =>
                    setForm({ ...form, action: event.target.value })
                  }
                >
                  <option value="approve">通过</option>
                  <option value="reject">驳回</option>
                  <option value="abnormal">异常</option>
                </select>
              </div>
              {isSelectedProduction ? (
                <label className="row">
                  <input
                    type="checkbox"
                    checked={form.includeRanking}
                    onChange={(event) =>
                      setForm({ ...form, includeRanking: event.target.checked })
                    }
                    style={{ width: 18 }}
                  />
                  允许计入排行
                </label>
              ) : (
                <div className="notice">非生产日报不会计入排行。</div>
              )}
              <div className="field">
                <label>审核备注</label>
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                />
              </div>
              <button className="primary" disabled={saving}>
                {saving ? "提交中..." : "提交审核"}
              </button>
            </>
          ) : (
            <div className="notice">请选择一条待审核日报。</div>
          )}
        </form>
      </section>
    </main>
  );
}

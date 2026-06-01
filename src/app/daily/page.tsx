"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Account = {
  recordId: string;
  accountName: string;
  platform: string;
  accountType: string;
  startCredits: number;
};

type DailyRow = {
  recordId: string;
  dailyType: string;
  date: string;
  account: string;
  platform: string;
  remainingCredits: number;
  consumedCredits: number;
  roughCutSeconds: number;
  status: string;
  includeRanking: string;
};

type DailyData = {
  user: {
    userId: string;
    name: string;
    role: string;
    group: string;
    enabled: string;
  };
  today: string;
  yesterday: string;
  accounts: Account[];
  recentDaily: DailyRow[];
};

function resolveSelectedAccountId(currentAccountId: string, accounts: Account[]) {
  if (accounts.some((account) => account.recordId === currentAccountId)) {
    return currentAccountId;
  }
  return accounts.length === 1 ? accounts[0].recordId : "";
}

export default function DailyPage() {
  const [data, setData] = useState<DailyData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    dateMode: "today",
    dailyType: "生产日报",
    selectedAccountId: "",
    changedAccount: false,
    remainingCredits: "",
    assetCount: "",
    roughCutSeconds: "",
    hasIssue: false,
    issueNote: "",
    nonProductionNote: ""
  });

  async function load() {
    setLoading(true);
    setError("");
    const meResponse = await fetch("/api/me", { credentials: "include" });
    const mePayload = await meResponse.json().catch(() => ({}));
    if (!meResponse.ok) {
      setError(mePayload.error || "无法识别当前登录用户");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/daily", { credentials: "include" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "无法读取日报页面数据");
      setLoading(false);
      return;
    }
    setData({ ...payload, user: mePayload.user });
    setForm((current) => ({
      ...current,
      selectedAccountId: resolveSelectedAccountId(
        current.selectedAccountId,
        payload.accounts ?? []
      )
    }));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedAccount = useMemo(
    () =>
      data?.accounts.find((account) => account.recordId === form.selectedAccountId),
    [data?.accounts, form.selectedAccountId]
  );
  const isProduction = form.dailyType === "生产日报";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isProduction && !selectedAccount) {
      setError(
        data?.accounts.length
          ? "请选择可用账号"
          : "当前小组暂无可用账号，请联系导演维护账号。"
      );
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    const selectedDate = form.dateMode === "today" ? data?.today : data?.yesterday;
    const response = await fetch("/api/daily", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: selectedDate,
        reportType: form.dailyType,
        dateMode: form.dateMode,
        dailyType: form.dailyType,
        accountRecordId: isProduction ? form.selectedAccountId : "",
        isAccountChanged: form.changedAccount,
        changedAccount: form.changedAccount,
        remainingCredits: Number(form.remainingCredits),
        assetCount: Number(form.assetCount),
        videoDurationSeconds: Number(form.roughCutSeconds),
        roughCutSeconds: Number(form.roughCutSeconds),
        hasGenerationIssue: form.hasIssue,
        hasIssue: form.hasIssue,
        issueDescription: form.issueNote,
        issueNote: form.issueNote,
        workNote: form.nonProductionNote,
        note: form.nonProductionNote,
        summary: form.nonProductionNote,
        nonProductionNote: form.nonProductionNote
      })
    });
    const payload = await readResponsePayload(response);
    setSaving(false);

    if (!response.ok) {
      setError(formatSubmitError(payload));
      return;
    }

    setMessage("日报已提交");
    setForm((current) => ({
      ...current,
      remainingCredits: "",
      assetCount: "",
      roughCutSeconds: "",
      hasIssue: false,
      issueNote: "",
      nonProductionNote: ""
    }));
    await load();
  }

  return (
    <main className="page">
      <div className="page-title">
        <div>
          <h1>日报填写</h1>
          <p className="subtle">
            {data
              ? `${data.user.name} · ${data.user.group}`
              : "填写今日或昨日数据"}
          </p>
        </div>
        <a className="button" href="/api/auth/login">
          飞书登录
        </a>
      </div>

      {loading ? <div className="notice">正在读取数据...</div> : null}
      {error ? (
        <div className="notice error" style={{ whiteSpace: "pre-line" }}>
          {error}
        </div>
      ) : null}
      {message ? <div className="notice success">{message}</div> : null}

      {data ? (
        <section className="grid">
          <form className="panel form" onSubmit={submit}>
            <div className="field">
              <label>日报日期</label>
              <select
                value={form.dateMode}
                onChange={(event) =>
                  setForm({ ...form, dateMode: event.target.value })
                }
              >
                <option value="today">今日 · {data.today}</option>
                <option value="yesterday">昨日 · {data.yesterday}</option>
              </select>
            </div>

            <div className="field">
              <label>日报类型</label>
              <select
                value={form.dailyType}
                onChange={(event) =>
                  setForm({ ...form, dailyType: event.target.value })
                }
              >
                <option value="生产日报">生产日报</option>
                <option value="筹备日报">筹备日报</option>
                <option value="复盘日报">复盘日报</option>
                <option value="其他">其他</option>
              </select>
            </div>

            {isProduction ? (
              <>
                <div className="field">
                  <label>账号</label>
                  {data.accounts.length ? (
                    <>
                      <select
                        value={form.selectedAccountId}
                        required
                        onChange={(event) =>
                          setForm({
                            ...form,
                            selectedAccountId: event.target.value
                          })
                        }
                      >
                        {data.accounts.length > 1 ? (
                          <option value="">请选择账号</option>
                        ) : null}
                        {data.accounts.map((account) => (
                          <option key={account.recordId} value={account.recordId}>
                            {account.platform} · {account.accountName} ·{" "}
                            {account.accountType}
                          </option>
                        ))}
                      </select>
                      {selectedAccount ? (
                        <span className="subtle">
                          起始积分 {selectedAccount.startCredits}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <div className="notice error">
                      当前小组暂无可用账号，请联系导演维护账号。
                    </div>
                  )}
                </div>

                <label className="row">
                  <input
                    type="checkbox"
                    checked={form.changedAccount}
                    onChange={(event) =>
                      setForm({ ...form, changedAccount: event.target.checked })
                    }
                    style={{ width: 18 }}
                  />
                  是否换号
                </label>

                <div className="field">
                  <label>今日剩余积分</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.remainingCredits}
                    onChange={(event) =>
                      setForm({ ...form, remainingCredits: event.target.value })
                    }
                  />
                </div>

                <div className="field">
                  <label>本日资产生成数量</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.assetCount}
                    onChange={(event) =>
                      setForm({ ...form, assetCount: event.target.value })
                    }
                  />
                </div>

                <div className="field">
                  <label>本日视频粗剪时长（s）</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.roughCutSeconds}
                    onChange={(event) =>
                      setForm({ ...form, roughCutSeconds: event.target.value })
                    }
                  />
                </div>

                <label className="row">
                  <input
                    type="checkbox"
                    checked={form.hasIssue}
                    onChange={(event) =>
                      setForm({ ...form, hasIssue: event.target.checked })
                    }
                    style={{ width: 18 }}
                  />
                  是否存在生成问题
                </label>

                <div className="field">
                  <label>生成问题说明</label>
                  <textarea
                    value={form.issueNote}
                    onChange={(event) =>
                      setForm({ ...form, issueNote: event.target.value })
                    }
                  />
                </div>
              </>
            ) : (
              <div className="field">
                <label>非生产说明</label>
                <textarea
                  required
                  value={form.nonProductionNote}
                  onChange={(event) =>
                    setForm({ ...form, nonProductionNote: event.target.value })
                  }
                />
              </div>
            )}

            <button
              className="primary"
              disabled={saving || (isProduction && !selectedAccount)}
            >
              {saving ? "提交中..." : "提交日报"}
            </button>
          </form>

          <section className="panel">
            <h2>最近提交</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>日期</th>
                    <th>账号</th>
                    <th>消耗</th>
                    <th>粗剪</th>
                    <th>状态</th>
                    <th>排行</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentDaily.map((row) => (
                    <tr key={row.recordId}>
                      <td>{row.dailyType || "生产日报"}</td>
                      <td>{row.date}</td>
                      <td>{row.account || "-"}</td>
                      <td>{row.consumedCredits}</td>
                      <td>{row.roughCutSeconds}</td>
                      <td>
                        <span className="badge">{row.status}</span>
                      </td>
                      <td>{row.includeRanking}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

async function readResponsePayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { reason: text };
  }
}

function formatSubmitError(payload: Record<string, unknown>) {
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  const error = typeof payload.error === "string" ? payload.error : "";
  const feishuError =
    payload.feishuError &&
    typeof payload.feishuError === "object" &&
    !Array.isArray(payload.feishuError)
      ? (payload.feishuError as Record<string, unknown>)
      : null;

  if (feishuError) {
    return [
      `error: ${error || "-"}`,
      `reason: ${reason || "-"}`,
      `feishuError.status: ${formatErrorValue(feishuError.status)}`,
      `feishuError.code: ${formatErrorValue(feishuError.code)}`,
      `feishuError.message: ${formatErrorValue(feishuError.message)}`,
      `feishuError.path: ${formatErrorValue(feishuError.path)}`
    ].join("\n");
  }

  if (reason && error && error !== reason) return `${error}：${reason}`;
  return reason || error || "提交失败";
}

function formatErrorValue(value: unknown) {
  if (typeof value === "string") return value || "-";
  if (typeof value === "number") return String(value);
  return "-";
}

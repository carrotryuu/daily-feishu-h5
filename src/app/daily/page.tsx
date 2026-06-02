"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  accountSelectOptionLabel,
  accountSelectOptionValue,
  buildDailySubmitPayload,
  canSubmitDailyForm,
  findSelectedAccount,
  isProductionDaily,
  resolveSelectedAccountId,
  selectedAccountStartCredits,
  selectedAccountIdFromSelectValue,
  type DailyFormAccount
} from "@/lib/daily-form";
import {
  buildDailySuccessDialog,
  type SuccessDialog
} from "@/lib/frontend-feedback";

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
  accounts: DailyFormAccount[];
  recentDaily: DailyRow[];
};

const DAILY_SUBMIT_TIMEOUT_MS = 120_000;

export default function DailyPage() {
  const [data, setData] = useState<DailyData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [successDialog, setSuccessDialog] = useState<SuccessDialog | null>(null);
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
    () => findSelectedAccount(data?.accounts ?? [], form.selectedAccountId),
    [data?.accounts, form.selectedAccountId]
  );
  const selectedStartCredits = selectedAccountStartCredits(
    data?.accounts ?? [],
    form.selectedAccountId
  );
  const isProduction = isProductionDaily(form.dailyType);
  const selectedDate = form.dateMode === "today" ? data?.today : data?.yesterday;
  const previewPreviousCredits = useMemo(() => {
    if (!selectedAccount || !selectedDate) return undefined;
    const previous = (data?.recentDaily ?? [])
      .filter(
        (row) =>
          row.account === selectedAccount.accountName &&
          row.date < selectedDate
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    return previous?.remainingCredits ?? selectedAccount.startCredits;
  }, [data?.recentDaily, selectedAccount, selectedDate]);
  const previewConsumedCredits = useMemo(() => {
    if (!selectedAccount || !form.remainingCredits) return undefined;
    const remainingCredits = Number(form.remainingCredits);
    if (!Number.isFinite(remainingCredits)) return undefined;
    const base = form.changedAccount
      ? selectedAccount.startCredits
      : previewPreviousCredits;
    if (base === undefined) return undefined;
    return base - remainingCredits;
  }, [
    form.changedAccount,
    form.remainingCredits,
    previewPreviousCredits,
    selectedAccount
  ]);

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
    setSuccessDialog(null);

    try {
      const response = await fetchWithTimeout(
        "/api/daily",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildDailySubmitPayload(form, selectedDate))
        },
        DAILY_SUBMIT_TIMEOUT_MS
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        setError(formatSubmitError(payload));
        return;
      }

      setSuccessDialog(buildDailySuccessDialog(form.dailyType, payload));
      setForm((current) => ({
        ...current,
        remainingCredits: "",
        assetCount: "",
        roughCutSeconds: "",
        hasIssue: false,
        issueNote: "",
        nonProductionNote: ""
      }));
      appendSubmittedDaily(payload);
    } catch (error) {
      setError(formatClientSubmitError(error));
    } finally {
      setSaving(false);
    }
  }

  function appendSubmittedDaily(payload: Record<string, unknown>) {
    const daily = payload.daily;
    const recordId = typeof payload.recordId === "string" ? payload.recordId : "";
    if (!data || !recordId || !daily || typeof daily !== "object") return;

    const row = daily as Partial<DailyRow>;
    setData({
      ...data,
      recentDaily: [
        {
          recordId,
          dailyType: String(row.dailyType || form.dailyType),
          date: String(row.date || selectedDate || ""),
          account: String(row.account || ""),
          platform: String(row.platform || ""),
          remainingCredits: Number(row.remainingCredits || 0),
          consumedCredits: Number(row.consumedCredits || 0),
          roughCutSeconds: Number(row.roughCutSeconds || 0),
          status: String(row.status || ""),
          includeRanking: String(row.includeRanking || "")
        },
        ...data.recentDaily.filter((item) => item.recordId !== recordId)
      ].slice(0, 20)
    });
  }

  async function confirmDailySuccess() {
    setSuccessDialog(null);
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
      {successDialog ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <h2>{successDialog.title}</h2>
            <p>{successDialog.content}</p>
            {successDialog.warning ? (
              <p className="dialog-warning">{successDialog.warning}</p>
            ) : null}
            <button
              className="primary"
              type="button"
              onClick={() => void confirmDailySuccess()}
            >
              确认
            </button>
          </div>
        </div>
      ) : null}

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
                      {/* 注意：select.value / option.value 必须使用飞书账号表 recordId。展示文案不能作为 value，否则浏览器会出现“请在列表中选择一项”的原生校验错误。 */}
                      <select
                        value={form.selectedAccountId}
                        required={isProduction}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            selectedAccountId: selectedAccountIdFromSelectValue(
                              event.target.value
                            )
                          })
                        }
                      >
                        <option value="">请选择账号</option>
                        {data.accounts.map((account) => (
                          <option
                            key={account.recordId}
                            value={accountSelectOptionValue(account)}
                          >
                            {accountSelectOptionLabel(account)}
                          </option>
                        ))}
                      </select>
                      {selectedStartCredits !== undefined ? (
                        <span className="subtle">起始积分 {selectedStartCredits}</span>
                      ) : null}
                      {previewPreviousCredits !== undefined ? (
                        <span className="subtle">
                          昨日剩余积分 {previewPreviousCredits}
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
                  {previewConsumedCredits !== undefined ? (
                    <span className="subtle">
                      预计今日积分消耗 {previewConsumedCredits}
                    </span>
                  ) : null}
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

                <div className="field">
                  <label>是否存在生成问题</label>
                  <div className="row" role="radiogroup" aria-label="是否存在生成问题">
                    <label className="row">
                      <input
                        type="radio"
                        name="hasIssue"
                        checked={!form.hasIssue}
                        onChange={() =>
                          setForm({ ...form, hasIssue: false, issueNote: "" })
                        }
                        style={{ width: 18 }}
                      />
                      否
                    </label>
                    <label className="row">
                      <input
                        type="radio"
                        name="hasIssue"
                        checked={form.hasIssue}
                        onChange={() => setForm({ ...form, hasIssue: true })}
                        style={{ width: 18 }}
                      />
                      是
                    </label>
                  </div>
                </div>

                {form.hasIssue ? (
                  <div className="field">
                    <label>生成问题说明</label>
                    <textarea
                      required
                      value={form.issueNote}
                      onChange={(event) =>
                        setForm({ ...form, issueNote: event.target.value })
                      }
                    />
                  </div>
                ) : null}
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
              disabled={saving || !canSubmitDailyForm(form, data.accounts)}
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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function formatClientSubmitError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "提交等待时间过长，可能是飞书数据读取太慢。请先刷新页面确认是否已经提交成功，避免重复提交。";
  }
  if (error instanceof Error) return error.message || "提交失败";
  return "提交失败";
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

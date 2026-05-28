"use client";

import { FormEvent, useEffect, useState } from "react";
import { ACCOUNT_TYPES, PLATFORM_OPTIONS } from "@/lib/constants";

type Account = {
  recordId: string;
  group: string;
  platform: string;
  accountName: string;
  accountType: string;
  accountStatus: string;
  animatorName?: string;
  userId?: string;
  startCredits: number;
  remark?: string;
};

type Person = {
  userId: string;
  name: string;
  role: string;
  group: string;
  enabled: string;
};

type AccountData = {
  user: Person;
  accounts: Account[];
  people: Person[];
};

type AccountForm = {
  recordId: string;
  group: string;
  platform: string;
  accountName: string;
  accountType: string;
  accountStatus: string;
  animatorName: string;
  userId: string;
  startCredits: string;
  remark: string;
};

const emptyForm: AccountForm = {
  recordId: "",
  group: "",
  platform: PLATFORM_OPTIONS[0],
  accountName: "",
  accountType: ACCOUNT_TYPES.personal,
  accountStatus: "启用",
  animatorName: "",
  userId: "",
  startCredits: "0",
  remark: ""
};

export default function AccountPage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    const meResponse = await fetch("/api/me");
    const mePayload = await meResponse.json().catch(() => ({}));
    if (!meResponse.ok) {
      setError(mePayload.error || "无法识别当前登录用户");
      return;
    }

    const response = await fetch("/api/account");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "无法读取账号数据");
      return;
    }
    setData({ ...payload, user: mePayload.user });
    setForm((current) => ({
      ...current,
      group: current.group || mePayload.user.group
    }));
  }

  useEffect(() => {
    void load();
  }, []);

  function edit(account: Account) {
    setForm({
      recordId: account.recordId,
      group: account.group,
      platform: (PLATFORM_OPTIONS as readonly string[]).includes(account.platform)
        ? account.platform
        : "其他",
      accountName: account.accountName,
      accountType: account.accountType,
      accountStatus: account.accountStatus,
      animatorName: account.animatorName || "",
      userId: account.userId || "",
      startCredits: String(account.startCredits),
      remark: account.remark || ""
    });
  }

  function bindPerson(userId: string) {
    const person = data?.people.find((item) => item.userId === userId);
    setForm({
      ...form,
      userId,
      animatorName: person?.name || ""
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (form.accountType === ACCOUNT_TYPES.personal && !form.userId) {
      setError("个人绑定账号必须选择绑定动画师");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        recordId: form.recordId || undefined,
        startCredits: Number(form.startCredits)
      })
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(payload.error || "保存失败");
      return;
    }

    setMessage("账号已保存");
    setForm({ ...emptyForm, group: data?.user.group || "" });
    await load();
  }

  return (
    <main className="page">
      <div className="page-title">
        <div>
          <h1>账号维护</h1>
          <p className="subtle">
            {data ? `${data.user.name} · ${data.user.group}` : "平台账号"}
          </p>
        </div>
        <a className="button" href="/api/auth/login">
          飞书登录
        </a>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <section className="grid">
        <form className="panel form" onSubmit={submit}>
          <h2>{form.recordId ? "编辑账号" : "新增账号"}</h2>
          <div className="field">
            <label>所属小组</label>
            <input
              required
              value={form.group}
              onChange={(event) => setForm({ ...form, group: event.target.value })}
            />
          </div>
          <div className="field">
            <label>平台</label>
            <select
              value={form.platform}
              onChange={(event) =>
                setForm({ ...form, platform: event.target.value })
              }
            >
              {PLATFORM_OPTIONS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>账号名称</label>
            <input
              required
              value={form.accountName}
              onChange={(event) =>
                setForm({ ...form, accountName: event.target.value })
              }
            />
          </div>
          <div className="field">
            <label>账号类型</label>
            <select
              value={form.accountType}
              onChange={(event) =>
                setForm({ ...form, accountType: event.target.value })
              }
            >
              <option>{ACCOUNT_TYPES.personal}</option>
              <option>{ACCOUNT_TYPES.shared}</option>
            </select>
          </div>
          <div className="field">
            <label>账号状态</label>
            <select
              value={form.accountStatus}
              onChange={(event) =>
                setForm({ ...form, accountStatus: event.target.value })
              }
            >
              <option>启用</option>
              <option>停用</option>
            </select>
          </div>
          <div className="field">
            <label>绑定动画师</label>
            <select
              value={form.userId}
              onChange={(event) => bindPerson(event.target.value)}
            >
              <option value="">不绑定</option>
              {(data?.people ?? [])
                .map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>账号起始积分</label>
            <input
              type="number"
              min="0"
              required
              value={form.startCredits}
              onChange={(event) =>
                setForm({ ...form, startCredits: event.target.value })
              }
            />
          </div>
          <div className="field">
            <label>备注</label>
            <textarea
              value={form.remark}
              onChange={(event) =>
                setForm({ ...form, remark: event.target.value })
              }
            />
          </div>
          <div className="row">
            <button className="primary" disabled={saving}>
              {saving ? "保存中..." : "保存账号"}
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...emptyForm, group: data?.user.group || "" })}
            >
              清空
            </button>
          </div>
        </form>

        <section className="panel">
          <h2>账号列表</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>小组</th>
                  <th>平台</th>
                  <th>账号</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>绑定</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(data?.accounts ?? []).map((account) => (
                  <tr key={account.recordId}>
                    <td>{account.group}</td>
                    <td>{account.platform}</td>
                    <td>{account.accountName}</td>
                    <td>{account.accountType}</td>
                    <td>
                      <span className="badge">{account.accountStatus}</span>
                    </td>
                    <td>{account.animatorName || "-"}</td>
                    <td>
                      <button type="button" onClick={() => edit(account)}>
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

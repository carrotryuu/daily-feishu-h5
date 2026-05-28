"use client";

import { FormEvent, useEffect, useState } from "react";

type RankingRow = {
  recordId: string;
  month: string;
  rank: number;
  animatorName: string;
  group: string;
  roughCutSeconds: number;
  weightedRoughCutSeconds: number;
  averageWeight: number;
  updatedAt: string;
};

type RankingData = {
  user: {
    userId: string;
    name: string;
    role: string;
    group: string;
    enabled: string;
  };
  month: string;
  rows: RankingRow[];
};

export default function RankingPage() {
  const [data, setData] = useState<RankingData | null>(null);
  const [month, setMonth] = useState("");
  const [error, setError] = useState("");

  async function load(targetMonth?: string) {
    setError("");
    const meResponse = await fetch("/api/me");
    const mePayload = await meResponse.json().catch(() => ({}));
    if (!meResponse.ok) {
      setError(mePayload.error || "无法识别当前登录用户");
      return;
    }

    const query = targetMonth ? `?month=${encodeURIComponent(targetMonth)}` : "";
    const response = await fetch(`/api/ranking${query}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "无法读取排行榜");
      return;
    }
    setData({ ...payload, user: mePayload.user });
    setMonth(payload.month);
  }

  useEffect(() => {
    void load();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(month);
  }

  return (
    <main className="page">
      <div className="page-title">
        <div>
          <h1>月度排行</h1>
          <p className="subtle">
            {data ? `${data.user.name} · ${data.user.role}` : "排行榜查看"}
          </p>
        </div>
        <a className="button" href="/api/auth/login">
          飞书登录
        </a>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <form className="row" onSubmit={submit}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>月份</label>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>
          <button className="primary">查看</button>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>月份</th>
                <th>排名</th>
                <th>动画师姓名</th>
                <th>所属小组</th>
                <th>月粗剪总时长</th>
                <th>月加权粗剪总时长</th>
                <th>月平均K权重</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => (
                <tr key={row.recordId}>
                  <td>{row.month}</td>
                  <td>{row.rank}</td>
                  <td>{row.animatorName}</td>
                  <td>{row.group}</td>
                  <td>{row.roughCutSeconds}</td>
                  <td>{row.weightedRoughCutSeconds}</td>
                  <td>{row.averageWeight}</td>
                  <td>{row.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

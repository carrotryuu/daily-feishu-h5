import Link from "next/link";
import { canAccessAccountPage } from "@/lib/account-permissions";
import { getCurrentUser } from "@/lib/auth";

async function canShowAccountEntry() {
  try {
    return canAccessAccountPage(await getCurrentUser());
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const showAccountEntry = await canShowAccountEntry();

  return (
    <main className="page">
      <div className="page-title">
        <div>
          <h1>飞书多维表格轻量版 H5 日报系统</h1>
          <p className="subtle">日报填写、审核、账号维护、月度排行统一入口。</p>
        </div>
        <a className="button primary" href="/api/auth/login">
          飞书登录
        </a>
      </div>

      <section className="grid">
        <Link className="card" href="/daily">
          <h2>日报填写</h2>
          <p className="subtle">动画师提交今日或昨日数据。</p>
        </Link>
        <Link className="card" href="/review">
          <h2>日报审核</h2>
          <p className="subtle">导演和管理岗审核日报并打 K 等级。</p>
        </Link>
        {showAccountEntry ? (
          <Link className="card" href="/account">
            <h2>账号维护</h2>
            <p className="subtle">维护平台账号、状态和绑定关系。</p>
          </Link>
        ) : null}
        <Link className="card" href="/ranking">
          <h2>排行榜</h2>
          <p className="subtle">查看个人、小组和全体月度排行。</p>
        </Link>
      </section>
    </main>
  );
}

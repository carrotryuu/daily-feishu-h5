import type { Metadata } from "next";
import Link from "next/link";
import { canAccessAccountPage } from "@/lib/account-permissions";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "飞书 H5 日报系统",
  description: "基于飞书多维表格的轻量版日报系统"
};

async function canShowAccountEntry() {
  try {
    return canAccessAccountPage(await getCurrentUser());
  } catch {
    return false;
  }
}

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const showAccountEntry = await canShowAccountEntry();

  return (
    <html lang="zh-CN">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              H5 日报系统
            </Link>
            <nav className="nav" aria-label="主导航">
              <Link href="/daily">日报</Link>
              <Link href="/review">审核</Link>
              {showAccountEntry ? <Link href="/account">账号</Link> : null}
              <Link href="/ranking">排行</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

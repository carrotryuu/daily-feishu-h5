import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "飞书 H5 日报系统",
  description: "基于飞书多维表格的轻量版日报系统"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
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
              <Link href="/account">账号</Link>
              <Link href="/ranking">排行</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

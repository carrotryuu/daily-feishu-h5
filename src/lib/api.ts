import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function jsonError(error: unknown) {
  if (error instanceof Response) {
    const contentType = error.headers.get("content-type") || "";
    const body = await error.text().catch(() => "");

    if (contentType.includes("application/json")) {
      return new Response(body, {
        status: error.status,
        statusText: error.statusText,
        headers: { "Content-Type": contentType }
      });
    }

    if (error.status === 403) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          reason: body || error.statusText || "当前请求无权访问"
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: body || error.statusText || "请求处理失败" },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : "请求处理失败";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Response("请求内容不是有效 JSON", { status: 400 });
  }
}

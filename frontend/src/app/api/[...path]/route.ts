import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  let targetUrl = "";
  try {
    const resolvedParams = await params;
    const pathStr = resolvedParams.path ? resolvedParams.path.join("/") : "";
    const searchParams = request.nextUrl.search;
    targetUrl = `${BACKEND_URL}/api/${pathStr}${searchParams}`;

    let body: ArrayBuffer | undefined = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.arrayBuffer();
    }

    const headers = new Headers();
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "host" && key.toLowerCase() !== "content-length") {
        headers.set(key, value);
      }
    });

    const res = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: body,
      // @ts-ignore
      duplex: "half",
    });

    const responseData = await res.arrayBuffer();
    return new NextResponse(responseData, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (error: any) {
    console.error("Proxy error:", error);
    return NextResponse.json({ 
      error: "Error de comunicación entre el frontend y el servicio backend",
      details: error?.message || String(error),
      targetUrl: targetUrl || `${BACKEND_URL}/api`,
      code: "PROXY_BACKEND_UNREACHABLE"
    }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const host = url.hostname; // ex.: hmg.ninechat.com.br
    const sub = host.endsWith(env.BASE_DOMAIN)
      ? host.slice(0, -(`.${env.BASE_DOMAIN}`.length))
      : host; // hmg, clinop, etc.

    // (opcional) fronts diferentes por host:
    const pagesHost = hostPagesMap[host] ?? env.PAGES_DEFAULT;

    // /api/v1/*
    if (url.pathname.startsWith("/api/v1/")) {
      const upstream = buildUpstream(env.API_V1_ORIGIN, url, /^\/api\/v1/);
      const init = await initWithTenantHeaders(request, host, sub);
      const res = await fetch(upstream, init);
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // /socket.io/* (WS + long-poll)
    if (url.pathname.startsWith("/socket.io/")) {
      const upstream = buildUpstream(env.WS_ORIGIN, url, /^\/socket\.io/);
      const init = await initWithTenantHeaders(request, host, sub, true);
      return fetch(new Request(upstream, init)); // negocia Upgrade automaticamente
    }

    // /emit (rota exata)
    if (url.pathname === "/emit") {
      const u = new URL(env.EMIT_ORIGIN);
      u.search = url.search;
      const init = await initWithTenantHeaders(request, host, sub);
      const res = await fetch(u.toString(), init);
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // fallback → front no Pages
    url.hostname = pagesHost;
    url.protocol = "https:";
    return fetch(new Request(url.toString(), request));
  }
};

// mapeie fronts específicos aqui (se quiser); senão, usa PAGES_DEFAULT
const hostPagesMap: Record<string, string> = {
  // "hmg.ninechat.com.br": "ninefront.pages.dev",
  // "portal.ninechat.com.br": "ninelogin.pages.dev",
};

async function initWithTenantHeaders(req: Request, originalHost: string, sub: string, isWS = false): Promise<RequestInit> {
  const method = req.method.toUpperCase();
  const headers = new Headers(req.headers);
  headers.delete("host"); headers.delete("content-length");
  headers.set("X-Original-Host", originalHost);
  headers.set("X-Subdomain", sub);
  headers.set("X-Forwarded-Host", originalHost);
  headers.set("X-Forwarded-Proto", "https");
  return {
    method,
    headers,
    body: isWS || ["GET","HEAD"].includes(method) ? undefined : await req.arrayBuffer(),
  };
}

function buildUpstream(origin: string, reqUrl: URL, strip: RegExp): string {
  const suffix = reqUrl.pathname.replace(strip, "") || "/";
  const base = new URL(origin);
  base.pathname = joinPath(base.pathname, suffix);
  base.search = reqUrl.search;
  return base.toString();
}

function joinPath(a = "", b = "/") {
  a = a.endsWith("/") ? a.slice(0, -1) : a;
  b = b.startsWith("/") ? b : `/${b}`;
  return (a + b) || "/";
}

type Env = {
  BASE_DOMAIN: string;
  PAGES_DEFAULT: string;
  API_V1_ORIGIN: string;
  WS_ORIGIN: string;
  EMIT_ORIGIN: string;
};

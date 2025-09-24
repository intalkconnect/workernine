export default {
  async fetch(request: Request, env: Env) {
    const url  = new URL(request.url);
    const host = url.hostname;                 // ex: hmg.ninechat.com.br
    const sub  = host.endsWith(env.BASE_DOMAIN)
      ? host.slice(0, -(`.${env.BASE_DOMAIN}`.length))
      : host;                                  // "hmg", "portal", ...

    // /api/v1/*
    if (url.pathname.startsWith("/api/v1/")) {
      const upstream = buildUpstream(env.API_V1_ORIGIN, url, /^\/api\/v1/);
      const init = await withTenantHeaders(request, host, sub);
      const res = await fetch(upstream, init);
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // /socket.io/*
    if (url.pathname.startsWith("/socket.io/")) {
      const upstream = buildUpstream(env.WS_ORIGIN, url, /^\/socket\.io/);
      const init = await withTenantHeaders(request, host, sub, true);
      return fetch(new Request(upstream, init)); // WS/long-poll
    }

    // /emit (exato)
    if (url.pathname === "/emit") {
      const u = new URL(env.EMIT_ORIGIN); u.search = url.search;
      const init = await withTenantHeaders(request, host, sub);
      const res = await fetch(u.toString(), init);
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // ✅ Fallback: NÃO troca hostname → front mantém o subdomínio (tenant)
    return fetch(request);
  }
};

async function withTenantHeaders(req: Request, originalHost: string, sub: string, isWS = false): Promise<RequestInit> {
  const m = req.method.toUpperCase();
  const h = new Headers(req.headers);
  h.delete("host"); h.delete("content-length");
  h.set("X-Tenant", sub);
  h.set("X-Original-Host", originalHost);
  h.set("X-Forwarded-Host", originalHost);
  h.set("X-Forwarded-Proto", "https");
  return { method: m, headers: h, body: isWS || ["GET","HEAD"].includes(m) ? undefined : await req.arrayBuffer() };
}

function buildUpstream(origin: string, reqUrl: URL, strip: RegExp): string {
  const suffix = reqUrl.pathname.replace(strip, "") || "/";
  const base = new URL(origin);
  base.pathname = joinPath(base.pathname, suffix);
  base.search = reqUrl.search; // preserva ?tenant= em localhost etc.
  return base.toString();
}
function joinPath(a = "", b = "/"){ a=a.endsWith("/")?a.slice(0,-1):a; b=b.startsWith("/")?b:`/${b}`; return (a+b)||"/"; }

type Env = {
  BASE_DOMAIN: string;            // "ninechat.com.br"
  API_V1_ORIGIN: string;          // ex: "https://northgate.ninechat.com.br/api/v1"
  WS_ORIGIN: string;              // ex: "https://northgate.ninechat.com.br/socket.io"
  EMIT_ORIGIN: string;            // ex: "https://northgate.ninechat.com.br/emit"
};

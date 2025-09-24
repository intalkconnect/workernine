export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const host = url.hostname;

    // ---------- OPCIONAL (por host) ----------
    // Se quiser origens diferentes por subdomínio, defina aqui.
    // Caso não precise, ignore este bloco e o código usa as VARS globais do wrangler.toml.
    const hostMap: Partial<Record<string, Origins>> = {
      // Exemplo:
      // "hmg.ninechat.com.br":   { api: "https://api-hmg.example.com", ws: "https://ws-hmg.example.com", emit: "https://emit-hmg.example.com", pages: "seu-projeto-hmg.pages.dev" },
      // "clinop.ninechat.com.br":{ api: "https://api-clinop.example.com", ws: "https://ws-clinop.example.com", emit: "https://emit-clinop.example.com", pages: "seu-projeto.pages.dev" },
    };
    const chosen = hostMap[host] ?? { api: env.API_V1_ORIGIN, ws: env.WS_ORIGIN, emit: env.EMIT_ORIGIN, pages: env.PAGES_HOST };
    // -----------------------------------------

    // 1) /api/v1/*
    if (url.pathname.startsWith("/api/v1/")) {
      const upstream = buildUpstream(chosen.api, url, /^\/api\/v1/);
      const init = await passthroughInit(request);
      const res = await fetch(upstream, init);
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // 2) /socket.io/* (WebSocket + long-poll)
    if (url.pathname.startsWith("/socket.io/")) {
      const upstream = buildUpstream(chosen.ws, url, /^\/socket\.io/);
      return fetch(new Request(upstream, request)); // negocia Upgrade automaticamente
    }

    // 3) /emit (rota exata)
    if (url.pathname === "/emit") {
      const upstream = new URL(chosen.emit);
      upstream.search = url.search;
      const init = await passthroughInit(request);
      const res = await fetch(upstream.toString(), init);
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // 4) Demais caminhos -> Pages (front)
    url.hostname = chosen.pages;
    url.protocol = "https:";
    return fetch(new Request(url.toString(), request));
  }
};

function buildUpstream(origin: string, reqUrl: URL, strip: RegExp): string {
  const suffix = reqUrl.pathname.replace(strip, "") || "/";
  const base = new URL(origin);
  base.pathname = joinPath(base.pathname, suffix);
  base.search = reqUrl.search;
  return base.toString();
}
async function passthroughInit(request: Request): Promise<RequestInit> {
  const method = request.method.toUpperCase();
  const headers = new Headers(request.headers);
  headers.delete("host"); headers.delete("content-length");
  return { method, headers, body: ["GET","HEAD"].includes(method) ? undefined : await request.arrayBuffer() };
}
function joinPath(base: string, add: string) {
  const a = base?.endsWith("/") ? base.slice(0, -1) : (base || "");
  const b = add?.startsWith("/") ? add : `/${add || ""}`;
  return (a + b) || "/";
}
type Env = {
  PAGES_HOST: string;
  API_V1_ORIGIN: string;
  WS_ORIGIN: string;
  EMIT_ORIGIN: string;
};
type Origins = { api: string; ws: string; emit: string; pages: string };

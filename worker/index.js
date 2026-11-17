// Set ALLOWED_ORIGIN to the exact Pages origin, e.g. https://yunsangyeong.github.io
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN)
      return new Response("Origin denied", { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (
      request.method !== "GET" ||
      ![
        "/v5/market/instruments-info",
        "/v5/market/tickers",
        "/v5/market/kline",
      ].includes(url.pathname)
    )
      return new Response("Not found", { status: 404, headers });
    const upstream = new URL(
      url.pathname + url.search,
      "https://api.bybit.com",
    );
    const response = await fetch(upstream, {
      headers: { Accept: "application/json" },
    });
    return new Response(response.body, {
      status: response.status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  },
};

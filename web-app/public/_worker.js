export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve session page for any /session/<code> path
    if (/^\/session\/[^/]+\/?$/.test(url.pathname)) {
      url.pathname = "/session/";
      return env.ASSETS.fetch(new Request(url, request));
    }

    return env.ASSETS.fetch(request);
  },
};

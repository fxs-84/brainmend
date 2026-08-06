// tests/setup/http-mock.mjs
// 原生 fetch mock — 零依赖, 拦截 globalThis.fetch, 返回可控的 Response 对象
// 用法: const calls = mockFetch(handlers) ; calls() 返回所有调用记录

export function makeResponse(status, body) {
  const text = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  return new Response(text, {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export function mockFetch(handlers) {
  // handlers: Array<[matcher: RegExp|string, responder: Response | (url, init) => Response|object]>
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [matcher, responder] of handlers) {
      const match = typeof matcher === 'string'
        ? String(url) === matcher
        : matcher.test(String(url));
      if (match) {
        if (responder instanceof Response) return responder;
        const r = responder(String(url), init);
        return r instanceof Response ? r : makeResponse(200, r);
      }
    }
    return makeResponse(404, { message: 'Not Found' });
  };
  return () => calls;
}

export function restoreFetch(originalFetch) {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete globalThis.fetch;
  }
}

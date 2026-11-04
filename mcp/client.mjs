// Local HTTP adapter for the 小木 workbench. All business rules stay in server.mjs.
import {originFor, normalizeBase, describeServiceHint} from './config.mjs';

export class WujianError extends Error {
  constructor(message, {status = 0, path = '', body = null, code = '', cause = null} = {}) {
    super(message);
    this.name = 'WujianError';
    this.status = status;
    this.path = path;
    this.body = body;
    this.code = code;
    this.cause = cause;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
    else if (typeof value === 'object') params.append(key, JSON.stringify(value));
    else params.append(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

function parseBody(text, contentType = '') {
  if (!text) return null;
  if (/application\/json|text\/json/i.test(contentType)) {
    try { return JSON.parse(text); } catch { return text; }
  }
  try { return JSON.parse(text); } catch { return text; }
}

export function createClient(config = {}) {
  const baseUrl = normalizeBase(config.baseUrl);
  const origin = config.origin || originFor(baseUrl);
  const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 30_000;

  async function request(method, path, options = {}) {
    const verb = String(method || 'GET').toUpperCase();
    if (typeof path !== 'string' || !path.startsWith('/')) throw new WujianError('API 路径必须以 / 开头', {path});
    const url = baseUrl + path + buildQuery(options.query);
    const headers = {
      Accept: 'application/json',
      Origin: origin,
      ...(options.headers || {})
    };
    let payload;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    const attempts = verb === 'GET' || verb === 'HEAD' ? Math.max(0, Number(options.retries ?? 2)) : 0;
    let lastError;
    for (let attempt = 0; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('请求超时')), options.timeoutMs || timeoutMs);
      const signals = [controller.signal];
      if (options.signal) signals.push(options.signal);
      const signal = signals.length > 1 ? AbortSignal.any(signals) : controller.signal;
      try {
        const response = await fetch(url, {method: verb, headers, body: payload, signal});
        const text = await response.text();
        const data = parseBody(text, response.headers.get('content-type') || '');
        if (!response.ok) {
          const message = typeof data === 'object' && data?.error
            ? String(data.error)
            : `小木接口 ${verb} ${path} 返回 HTTP ${response.status}`;
          throw new WujianError(message, {status: response.status, path, body: data});
        }
        return data;
      } catch (error) {
        lastError = error;
        if (error instanceof WujianError && !shouldRetryStatus(error.status)) throw error;
        if (error?.name === 'AbortError') throw new WujianError(describeServiceHint({baseUrl}), {path, code: 'TIMEOUT', cause: error});
        if (attempt < attempts) { await sleep(200 * 2 ** attempt); continue; }
        break;
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastError instanceof WujianError) throw lastError;
    const hint = describeServiceHint({baseUrl});
    throw new WujianError(hint, {path, code: lastError?.code || 'NETWORK', cause: lastError});
  }

  return {
    baseUrl,
    origin,
    timeoutMs,
    request,
    get: (path, options = {}) => request('GET', path, options),
    post: (path, body, options = {}) => request('POST', path, {...options, body}),
    patch: (path, body, options = {}) => request('PATCH', path, {...options, body}),
    delete: (path, body, options = {}) => request('DELETE', path, {...options, body}),
    raw: async (path, options = {}) => {
      const response = await fetch(baseUrl + path + buildQuery(options.query), {
        headers: {Accept: '*/*', ...(options.headers || {})},
        signal: AbortSignal.timeout(options.timeoutMs || timeoutMs)
      });
      if (!response.ok) throw new WujianError(`HTTP ${response.status}`, {status: response.status, path});
      return {text: await response.text(), contentType: response.headers.get('content-type') || ''};
    }
  };
}

function shouldRetryStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

export function asWujianError(error, path = '') {
  if (error instanceof WujianError) return error;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return new WujianError('请求超时；小木可能正在执行长任务', {path, code: 'TIMEOUT', cause: error});
  }
  return new WujianError(error?.message || String(error), {path, code: error?.code || 'UNKNOWN', cause: error});
}

// Minimal JSON-RPC 2.0 / MCP helpers. Zero runtime dependencies.
export const PROTOCOL_VERSION = '2025-06-18';
export const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603
};

export class RpcError extends Error {
  constructor(code, message, data = undefined) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

export function result(id, value) {
  return {jsonrpc: '2.0', id, result: value};
}

export function error(id, code, message, data = undefined) {
  const payload = {jsonrpc: '2.0', id: id ?? null, error: {code, message}};
  if (data !== undefined) payload.error.data = data;
  return payload;
}

export function textContent(text) {
  return [{type: 'text', text: String(text ?? '')}];
}

export function toolError(message, data = undefined) {
  return {content: textContent(`错误：${message}`), isError: true, ...(data ? {structuredContent: data} : {})};
}

export function parseJsonLine(line) {
  const text = String(line ?? '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

export function chooseProtocol(requested) {
  return SUPPORTED_PROTOCOLS.includes(requested) ? requested : PROTOCOL_VERSION;
}

export function isNotification(message) {
  return message && !Object.hasOwn(message, 'id');
}

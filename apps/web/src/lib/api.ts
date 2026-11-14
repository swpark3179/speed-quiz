import type { ErrorCode } from '@sq/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        'x-requested-with': 'speed-quiz',
        ...(opts.body !== undefined && !(opts.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없어요. 네트워크를 확인해 주세요.');
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const e = (data ?? {}) as { code?: ErrorCode; message?: string };
    throw new ApiError(res.status, e.code ?? 'INTERNAL', e.message ?? '요청을 처리하지 못했어요.');
  }
  return data as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return '알 수 없는 오류가 발생했어요.';
}

/** Resize large images client-side before upload (protects venue Wi-Fi). */
export async function prepareImage(file: File, maxSide = 1600): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadImage(file: File): Promise<{ url: string; width: number | null; height: number | null }> {
  const blob = await prepareImage(file);
  const fd = new FormData();
  fd.append('file', blob, file.name.replace(/\.\w+$/, '') + (blob.type === 'image/webp' ? '.webp' : ''));
  return api('/api/admin/uploads', { method: 'POST', body: fd });
}

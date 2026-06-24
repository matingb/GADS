import { supabase, supabaseConfigError } from './supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const customFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined;

const API_PREFIX =
  customFunctionsUrl?.trim() ||
  (supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/api` : null);

type QueryValue = string | number | boolean | null | undefined;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
};

function buildPath(path: string, query?: Record<string, QueryValue>): string {
  if (!API_PREFIX) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_FUNCTIONS_URL env var.');
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${API_PREFIX}${cleanPath}`);

  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') return;
      url.searchParams.set(k, String(v));
    });
  }

  return url.toString();
}

async function authHeaders(): Promise<HeadersInit> {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase client is not configured.');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;

  return {
    'Content-Type': 'application/json',
    ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(buildPath(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const raw = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? JSON.parse(raw || '{}') : null;

  if (!res.ok) {
    const rawSnippet = raw ? raw.slice(0, 180) : '';
    throw new Error((body as any)?.error || `Error HTTP ${res.status}${rawSnippet ? `: ${rawSnippet}` : ''}`);
  }

  if (!isJson) {
    throw new Error('La API devolvio una respuesta no JSON. Revisa URL de Edge Functions y variables VITE_.');
  }

  return body as T;
}

export const api = {
  get: <T = unknown>(path: string, query?: Record<string, QueryValue>) =>
    apiRequest<T>(path, { method: 'GET', query }),
  post: <T = unknown>(path: string, body?: unknown, query?: Record<string, QueryValue>) =>
    apiRequest<T>(path, { method: 'POST', body, query }),
  put: <T = unknown>(path: string, body?: unknown, query?: Record<string, QueryValue>) =>
    apiRequest<T>(path, { method: 'PUT', body, query }),
  patch: <T = unknown>(path: string, body?: unknown, query?: Record<string, QueryValue>) =>
    apiRequest<T>(path, { method: 'PATCH', body, query }),
  delete: <T = unknown>(path: string, query?: Record<string, QueryValue>) =>
    apiRequest<T>(path, { method: 'DELETE', query }),
};

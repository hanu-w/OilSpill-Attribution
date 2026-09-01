/**
 * API client helper for OceanWatch backend communication.
 *
 * This module provides the HTTP transport layer for the ApiDataProvider.
 * It handles base URL configuration, request headers, and error handling.
 * No actual network calls are made until the backend is integrated.
 */

/**
 * Configuration for the API client
 */
interface ApiClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * API error with structured information
 */
export class ApiError extends Error {
  status: number;
  statusText: string;
  data?: unknown;

  constructor(status: number, statusText: string, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

/**
 * Creates an API client instance configured for the OceanWatch backend.
 *
 * @param config - Client configuration options
 * @returns Object with HTTP methods for API communication
 */
export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, headers = {}, timeout = 30000 } = config;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  /**
   * Makes an HTTP request to the API.
   * Currently stubbed - will be implemented when backend is integrated.
   */
  async function request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => undefined);
        throw new ApiError(
          response.status,
          response.statusText,
          `API request failed: ${endpoint}`,
          errorData
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ApiError(408, 'Request Timeout', `Request timed out: ${endpoint}`);
        }
        throw new ApiError(0, 'Network Error', error.message);
      }

      throw new ApiError(0, 'Unknown Error', 'An unknown error occurred');
    }
  }

  return {
    get<T>(endpoint: string, options?: RequestInit): Promise<T> {
      return request<T>(endpoint, { ...options, method: 'GET' });
    },

    post<T>(endpoint: string, body?: unknown, options?: RequestInit): Promise<T> {
      return request<T>(endpoint, {
        ...options,
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
    },

    put<T>(endpoint: string, body?: unknown, options?: RequestInit): Promise<T> {
      return request<T>(endpoint, {
        ...options,
        method: 'PUT',
        body: body ? JSON.stringify(body) : undefined,
      });
    },

    delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
      return request<T>(endpoint, { ...options, method: 'DELETE' });
    },
  };
}

/**
 * Default API client instance.
 * Configured via environment variables when backend integration is ready.
 */
export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30000,
});

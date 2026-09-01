/**
 * Typed envelope for list responses from the API layer.
 *
 * The provider boundary maps these into domain models; unknown backend
 * response shapes must never leak further than the adapter.
 */
export interface ApiListResponse<T> {
  data: T[];
  total?: number;
  page?: number;
}

/**
 * Standard error shape returned by the API layer.
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}
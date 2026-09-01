import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { OceanWatchDataProvider } from '../api/provider';
import { ApiDataProvider } from '../api/apiProvider';

/**
 * React Query client configuration.
 *
 * Configured with sensible defaults for API data fetching.
 * See AGENTS.md §6: Use TanStack Query for API/server data.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Data provider context.
 *
 * Components use this context to access the OceanWatchDataProvider
 * without knowing whether they're using mock or real API data.
 *
 * See AGENTS.md §3: Components never directly call fetch.
 */
const DataContext = createContext<OceanWatchDataProvider | null>(null);

/**
 * Hook to access the data provider.
 * Throws if used outside of DataProvider.
 */
export function useDataProvider(): OceanWatchDataProvider {
  const provider = useContext(DataContext);
  if (!provider) {
    throw new Error('useDataProvider must be used within a DataProvider');
  }
  return provider;
}

/**
 * Create the singleton data provider instance.
 * Uses mock data when VITE_USE_MOCK_DATA is true or API is not configured.
 */
const dataProvider: OceanWatchDataProvider = new ApiDataProvider();

/**
 * Data provider wrapper component.
 */
function DataProvider({ children }: { children: ReactNode }) {
  return (
    <DataContext.Provider value={dataProvider}>
      {children}
    </DataContext.Provider>
  );
}

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root providers wrapper for the OceanWatch application.
 *
 * Wraps the application with all required providers:
 * - QueryClientProvider for TanStack Query
 * - DataProvider for data access abstraction
 *
 * This component should wrap the entire application.
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataProvider>{children}</DataProvider>
    </QueryClientProvider>
  );
}

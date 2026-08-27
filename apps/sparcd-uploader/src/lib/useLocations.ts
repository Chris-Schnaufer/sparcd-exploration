import { useQuery } from '@tanstack/react-query';
import type { S3Config } from '@sparcd/types';
import { fetchLocations, type LocationsResult } from './s3';
import { readDiscovery, writeDiscovery } from './discoveryCache';

/**
 * Load + cache the camera-location registry for the connected endpoint.
 * Keyed on the endpoint so a reconnect to a different backend refetches,
 * but section switches and Assign revisits hit the cache. Locations change
 * rarely, so a long stale time avoids redundant reads.
 *
 * The registry itself is always read live; only the settings bucket it lives in
 * is remembered, which is what turns a store-wide probe into one HEAD.
 */
export function useLocations(cfg: S3Config | null, connectionId: number) {
  return useQuery<LocationsResult>({
    queryKey: ['locations', connectionId, cfg?.endpoint],
    queryFn: async () => {
      const result = await fetchLocations(cfg!, readDiscovery(cfg!)?.settingsBucket);
      writeDiscovery(cfg!, { settingsBucket: result.settingsBucket });
      return result;
    },
    enabled: !!cfg,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

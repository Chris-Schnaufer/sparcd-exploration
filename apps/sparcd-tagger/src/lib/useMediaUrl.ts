// The one place that turns a media object key into a URL the DOM can render.
// For a collection that means a presigned GET; for a local batch handed over by
// the uploader it means an object URL over bytes that never left the machine —
// the thumbnail until the folder opens, the original after. Every <img>/<video>
// goes through here, so neither mode touches a single call site.

import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store';
import { parseCollectionKey, presignImage } from './s3';
import { useLocalBatch, localMediaUrl } from './localBatch';

export function useMediaUrl(objectKey: string): { url: string | undefined; isError: boolean } {
  const cfg = useStore((s) => s.s3Config);
  const connectionId = useStore((s) => s.connectionId);
  const collectionKey = useStore((s) => s.selectedCollectionKey);
  const isLocal = useLocalBatch((s) => s.status === 'ready');
  const localBlob = useLocalBatch((s) => s.media[objectKey]);

  const { data, isError } = useQuery({
    queryKey: ['presign', connectionId, objectKey],
    queryFn: () => {
      const { bucket } = parseCollectionKey(collectionKey!);
      return presignImage(cfg!, bucket, objectKey);
    },
    enabled: !isLocal && !!cfg && !!collectionKey,
    staleTime: 50 * 60 * 1000, // under the 1h URL TTL
    retry: 1,
  });

  if (isLocal) {
    return { url: localBlob ? localMediaUrl(objectKey, localBlob) : undefined, isError: false };
  }
  return { url: data, isError };
}

import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyS3Request, summarizeProtocols } from './run_browser_benchmark.mjs';

const endpoint = 'https://example.test';
const bucket = 'sparcd-uploader-benchmark';

test('classifies media, metadata, multipart, and service requests without retaining URLs', () => {
  assert.equal(classifyS3Request(`${endpoint}/`, 'GET', bucket), 'service-root');
  assert.equal(
    classifyS3Request(`${endpoint}/${bucket}/Collections/uploader-benchmark/Uploads/run/a.JPG`, 'PUT', bucket),
    'media-put',
  );
  assert.equal(
    classifyS3Request(`${endpoint}/${bucket}/Collections/uploader-benchmark/Uploads/run/a.JPG`, 'HEAD', bucket),
    'media-head',
  );
  assert.equal(
    classifyS3Request(`${endpoint}/${bucket}/Collections/uploader-benchmark/Uploads/run/a.JPG?partNumber=2&uploadId=secret`, 'PUT', bucket),
    'multipart-part',
  );
  assert.equal(
    classifyS3Request(`${endpoint}/${bucket}/Collections/uploader-benchmark/Uploads/run/UploadComplete.json`, 'PUT', bucket),
    'metadata-put',
  );
});

test('summarizes negotiated protocols', () => {
  assert.deepEqual(
    summarizeProtocols([{ protocol: 'h2' }, { protocol: 'h3' }, { protocol: 'h3' }, {}]),
    { h2: 1, h3: 2, unknown: 1 },
  );
});

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixtureDir = fileURLToPath(new URL('./.fixtures/', import.meta.url));
const JPEG_SIZE = 262_144;
const LARGE_SIZE = 12_582_912;
const JPEG_COUNT = 360;
const LARGE_COUNT = 2;
const BASE_DATE = '2026:07:01 12:00:00';
const BASE_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4QBERXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAZADAAIAAAAUAAAAKDIwMjY6MDc6MDEgMTI6MDA6MDAA/9sAQwAGBAQFBAQGBQUFBgYGBwkOCQkICAkSDQ0KDhUSFhYVEhQUFxohHBcYHxkUFB0nHR8iIyUlJRYcKSwoJCshJCUk/9sAQwEGBgYJCAkRCQkRJBgUGCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk/8AAEQgAMABAAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8Ar0UUV7h4wUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/9kAAAAA';
const MP4_EPOCH_OFFSET_S = 2_082_844_800;

function jpeg(index) {
  const bytes = Buffer.from(BASE_JPEG_B64, 'base64');
  const at = bytes.indexOf(BASE_DATE, 0, 'latin1');
  const date = new Date(Date.UTC(2026, 6, 1, 12, 0, index));
  const stamp = `${date.getUTCFullYear()}:${String(date.getUTCMonth() + 1).padStart(2, '0')}:${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
  bytes.write(stamp, at, 'latin1');
  return Buffer.concat([bytes, Buffer.alloc(JPEG_SIZE - bytes.length, index)]);
}

function mp4(index) {
  const ftyp = Buffer.alloc(20);
  ftyp.writeUInt32BE(20, 0);
  ftyp.write('ftypisom', 4, 'latin1');
  ftyp.writeUInt32BE(512, 12);
  ftyp.write('isom', 16, 'latin1');
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'latin1');
  const seconds = Math.floor(Date.UTC(2026, 6, 2, 12, 0, index) / 1000) + MP4_EPOCH_OFFSET_S;
  mvhd.writeUInt32BE(seconds, 12);
  mvhd.writeUInt32BE(seconds, 16);
  mvhd.writeUInt32BE(1000, 20);
  mvhd.writeUInt32BE(1000, 24);
  const moov = Buffer.alloc(8);
  moov.writeUInt32BE(8 + mvhd.length, 0);
  moov.write('moov', 4, 'latin1');
  const header = Buffer.concat([ftyp, moov, mvhd]);
  return Buffer.concat([header, Buffer.alloc(LARGE_SIZE - header.length, 0xa0 + index)]);
}

await rm(fixtureDir, { recursive: true, force: true });
await mkdir(path.join(fixtureDir, 'bench-corpus', 'DCIM'), { recursive: true });
for (let i = 0; i < JPEG_COUNT; i++) {
  await writeFile(path.join(fixtureDir, 'bench-corpus', 'DCIM', `IMG_${String(i + 1).padStart(4, '0')}.JPG`), jpeg(i));
}
for (let i = 0; i < LARGE_COUNT; i++) {
  await writeFile(path.join(fixtureDir, 'bench-corpus', `CLIP_${String(i + 1).padStart(2, '0')}.MP4`), mp4(i));
}

console.log(`fixtures: ${JPEG_COUNT + LARGE_COUNT} files, ${JPEG_COUNT * JPEG_SIZE + LARGE_COUNT * LARGE_SIZE} bytes`);

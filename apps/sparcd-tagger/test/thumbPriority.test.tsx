import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const useMediaUrl = vi.hoisted(() => vi.fn(() => ({
  url: undefined,
  isError: false,
  markLoaded: vi.fn(),
})));

vi.mock('../src/lib/useMediaUrl', () => ({ useMediaUrl }));

import { Thumb, THUMB_MEDIA_PRIORITY } from '../src/components/Thumb';

describe('thumbnail media priority', () => {
  it('passes low priority into the scheduler hook', () => {
    renderToStaticMarkup(<Thumb objectKey="Collections/c/media.jpg" alt="media.jpg" />);

    expect(THUMB_MEDIA_PRIORITY).toBe('low');
    expect(useMediaUrl).toHaveBeenCalledWith('Collections/c/media.jpg', 'low');
  });
});

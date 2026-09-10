export type MediaPriority = 'high' | 'low';

export type MediaRequestLease = {
  admitted: Promise<void>;
  cancel: () => void;
  release: () => void;
};

type Request = {
  admitted: () => void;
  active: boolean;
  cancelled: boolean;
  released: boolean;
};

/**
 * Limits browser media work to a small number of admitted sources. Focus work
 * jumps ahead of thumbnails that are waiting, while already-loading media is
 * allowed to finish rather than being interrupted.
 */
export class MediaRequestScheduler {
  private active = 0;
  private readonly high: Request[] = [];
  private readonly low: Request[] = [];

  constructor(private readonly concurrency = 4) {}

  acquire(priority: MediaPriority): MediaRequestLease {
    let request!: Request;
    const admitted = new Promise<void>((resolve) => {
      request = { admitted: resolve, active: false, cancelled: false, released: false };
    });
    const release = () => {
      if (!request.active || request.released) return;
      request.released = true;
      this.active--;
      this.drain();
    };
    const cancel = () => {
      if (request.active) release();
      else request.cancelled = true;
    };
    (priority === 'high' ? this.high : this.low).push(request);
    this.drain();
    return { admitted, cancel, release };
  }

  private drain(): void {
    while (this.active < this.concurrency) {
      const request = this.next();
      if (!request) return;
      if (request.cancelled) continue;
      request.active = true;
      this.active++;
      request.admitted();
    }
  }

  private next(): Request | undefined {
    while (this.high.length) {
      const request = this.high.shift()!;
      if (!request.cancelled) return request;
    }
    while (this.low.length) {
      const request = this.low.shift()!;
      if (!request.cancelled) return request;
    }
    return undefined;
  }
}

export const mediaRequestScheduler = new MediaRequestScheduler();

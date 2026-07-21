/**
 * Subscribe-once WebSocket helper for serverless API routes.
 * Connects, collects messages for a window, then closes.
 */

export interface WebSocketCollectOptions {
  url: string;
  waitMs?: number;
  onOpen?: (ws: WebSocket) => void;
  parseMessage: (data: unknown) => unknown[];
}

export function collectWebSocketMessages<T>({
  url,
  waitMs = 4000,
  onOpen,
  parseMessage,
}: WebSocketCollectOptions): Promise<T[]> {
  return new Promise((resolve) => {
    const collected: T[] = [];
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(collected);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve([]);
      return;
    }

    const timer = setTimeout(finish, waitMs);

    ws.onopen = () => {
      onOpen?.(ws);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as unknown;
        const items = parseMessage(parsed);
        for (const item of items) {
          collected.push(item as T);
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      finish();
    };

    ws.onclose = () => {
      clearTimeout(timer);
      if (!settled) finish();
    };
  });
}

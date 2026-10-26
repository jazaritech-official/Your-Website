"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "./PusherSocketProvider";

/* ============================================================
   usePreviewSync — live preview synchronization over Socket.IO
   ------------------------------------------------------------
   Uses the SINGLE existing socket from "./PusherSocketProvider" (no new
   connections). The publishing client joins `preview:<roomId>`
   and debounce-emits `preview:update`; observers in the same
   room (e.g. admins watching a customer's order) receive the
   payload through `remote`. Backend relays are size-capped and
   payloads are sanitized before publishing.
   ============================================================ */

export interface PreviewSyncAnswer {
  label: string;
  value: string;
}

export interface PreviewSyncItem {
  productId?: string;
  answers?: PreviewSyncAnswer[];
}

export interface PreviewSyncPayload {
  items?: PreviewSyncItem[];
  updatedAt?: number;
}

const DEBOUNCE_MS = 400;

export interface UsePreviewSyncResult {
  /** Debounced, no-op-skipping publisher. Call on every state change. */
  publish: (payload: PreviewSyncPayload) => void;
  /** Latest payload received from another client in the room. */
  remote: PreviewSyncPayload | null;
  connected: boolean;
}

export function usePreviewSync(
  roomId: string | null | undefined,
): UsePreviewSyncResult {
  const { socket, isConnected } = useSocket();
  const [remote, setRemote] = useState<PreviewSyncPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayloadRef = useRef<string>("");

  // Join / leave the room + subscribe to relayed updates.
  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit("preview:join", { roomId });

    const handler = (data: {
      roomId?: string;
      payload?: PreviewSyncPayload;
    }) => {
      if (data && data.roomId === roomId) {
        setRemote(data.payload || null);
      }
    };
    socket.on("preview:update", handler);

    return () => {
      socket.off("preview:update", handler);
      socket.emit("preview:leave", { roomId });
    };
  }, [socket, roomId]);

  const publish = useCallback(
    (payload: PreviewSyncPayload) => {
      if (!socket || !roomId || !isConnected) return;

      const json = JSON.stringify(payload || {});
      if (json === lastPayloadRef.current) return; // no-op — skip

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastPayloadRef.current = json;
        socket.emit("preview:update", { roomId, payload });
      }, DEBOUNCE_MS);
    },
    [socket, roomId, isConnected],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { publish, remote, connected: isConnected };
}

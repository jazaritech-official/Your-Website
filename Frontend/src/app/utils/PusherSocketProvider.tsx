"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type PusherClient from "pusher-js";
import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";
import { baseUrl } from "./commonFunctions";

/**
 * Pusher-based Realtime Provider — replaces the LiveKit-based SocketProvider.
 *
 * Architecture:
 *   1. Frontend fetches Pusher config (key + cluster) from the REST API.
 *   2. Authenticates each channel subscription via the server's auth endpoint.
 *   3. All real-time events flow through Pusher private channels.
 *   4. Each authenticated user subscribes to "private-user-<userId>".
 *   5. Admins also subscribe to "presence-admin-presence" for online tracking.
 *   6. Events are routed by Pusher event names (same as old LiveKit topics).
 *
 * Server-side publishing: REST controllers use the Pusher server SDK
 * (pusher.trigger) to push events into users' channels.
 */

const PUSHER_MAX_CONNECT_ATTEMPTS = 3;
const PUSHER_CONNECT_RETRY_DELAYS_MS = [2000, 8000];

interface SocketContextType {
  /** Socket.IO compatibility shim — has emit/on/off with the same signature */
  socket: any;
  /** Whether the Pusher connection is active */
  isConnected: boolean;

  /**
   * Emit a real-time event.
   * Most events are sent via REST API (DB write required).
   * Presence/join events are no-ops (Pusher handles subscriptions automatically).
   */
  emit: (event: string, data: any) => void;

  /**
   * Subscribe to a real-time event by name.
   * Callback receives the event payload.
   */
  on: (event: string, callback: (data: any) => void) => void;

  /**
   * Unsubscribe from a real-time event.
   */
  off: (event: string, callback: (data: any) => void) => void;

  // ── Convenience callback subscriptions (same API as old SocketProvider) ──
  onNewMessage: (cb: (msg: any) => void) => void;
  offNewMessage: (cb: (msg: any) => void) => void;
  onUserTyping: (cb: (data: any) => void) => void;
  offUserTyping: (cb: (data: any) => void) => void;
  onMessagesRead: (cb: (data: any) => void) => void;
  offMessagesRead: (cb: (data: any) => void) => void;
  onNewNotification: (cb: (data: any) => void) => void;
  offNewNotification: (cb: (data: any) => void) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  emit: () => {},
  on: () => {},
  off: () => {},
  onNewMessage: () => {},
  offNewMessage: () => {},
  onUserTyping: () => {},
  offUserTyping: () => {},
  onMessagesRead: () => {},
  offMessagesRead: () => {},
  onNewNotification: () => {},
  offNewNotification: () => {},
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const auth = useSelector((state: RootState) => state.auth);
  const pusherRef = useRef<PusherClient | null>(null);
  const connectingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);

  // Callback refs for stable event subscriptions
  const eventCallbacksRef = useRef<Map<string, Set<(data: any) => void>>>(
    new Map()
  );
  const newMessageCallbacksRef = useRef<Set<(msg: any) => void>>(new Set());
  const userTypingCallbacksRef = useRef<Set<(data: any) => void>>(new Set());
  const messagesReadCallbacksRef = useRef<Set<(data: any) => void>>(new Set());
  const newNotificationCallbacksRef = useRef<Set<(data: any) => void>>(
    new Set()
  );

  // ── Subscribe/unsubscribe to events ──
  const on = useCallback((event: string, callback: (data: any) => void) => {
    if (!eventCallbacksRef.current.has(event)) {
      eventCallbacksRef.current.set(event, new Set());
    }
    eventCallbacksRef.current.get(event)!.add(callback);
  }, []);

  const off = useCallback((event: string, callback: (data: any) => void) => {
    eventCallbacksRef.current.get(event)?.delete(callback);
  }, []);

  // ── Convenience callback subscriptions ──
  const onNewMessage = useCallback((cb: (msg: any) => void) => {
    newMessageCallbacksRef.current.add(cb);
  }, []);
  const offNewMessage = useCallback((cb: (msg: any) => void) => {
    newMessageCallbacksRef.current.delete(cb);
  }, []);
  const onUserTyping = useCallback((cb: (data: any) => void) => {
    userTypingCallbacksRef.current.add(cb);
  }, []);
  const offUserTyping = useCallback((cb: (data: any) => void) => {
    userTypingCallbacksRef.current.delete(cb);
  }, []);
  const onMessagesRead = useCallback((cb: (data: any) => void) => {
    messagesReadCallbacksRef.current.add(cb);
  }, []);
  const offMessagesRead = useCallback((cb: (data: any) => void) => {
    messagesReadCallbacksRef.current.delete(cb);
  }, []);
  const onNewNotification = useCallback((cb: (data: any) => void) => {
    newNotificationCallbacksRef.current.add(cb);
  }, []);
  const offNewNotification = useCallback((cb: (data: any) => void) => {
    newNotificationCallbacksRef.current.delete(cb);
  }, []);

  // ── Emit: send events via REST API (same as LiveKit shim) ──
  const emit = useCallback(
    (event: string, data: any) => {
      // Events that require REST API calls (DB writes)
      if (event === "send_message") {
        fetch(`${baseUrl}chat/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        }).catch(() => {});
        return;
      }
      if (event === "mark_read" && data?.conversationId) {
        fetch(`${baseUrl}chat/conversations/${data.conversationId}/read`, {
          method: "PATCH",
          credentials: "include",
        }).catch(() => {});
        return;
      }
      if (event === "typing" && data?.conversationId) {
        fetch(`${baseUrl}chat/typing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ conversationId: data.conversationId }),
        }).catch(() => {});
        return;
      }

      // Events that are no-ops with Pusher (subscriptions are automatic)
      if (
        event === "join_conversation" ||
        event === "tracking:join" ||
        event === "tracking:leave" ||
        event === "preview:join" ||
        event === "preview:leave" ||
        event === "join_admin_room"
      ) {
        return;
      }
    },
    []
  );

  // ── Connect to Pusher when authenticated ──
  useEffect(() => {
    if (!auth.username || !auth.isVerified) {
      // Disconnect if not authenticated
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        pusherRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Prevent duplicate/stacked connection attempts
    if (connectingRef.current || pusherRef.current) return;
    connectingRef.current = true;

    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryConnect = async () => {
      attempt += 1;
      try {
        // Fetch Pusher config from the REST API
        const configRes = await fetch(`${baseUrl}pusher/config`, {
          method: "GET",
          credentials: "include",
        });

        if (!configRes.ok) {
          throw new Error(`Pusher config fetch failed (${configRes.status})`);
        }

        const configJson = await configRes.json();
        const pusherKey = configJson?.data?.key;
        const cluster = configJson?.data?.cluster;

        if (!pusherKey || !cluster) {
          throw new Error("Missing key or cluster in Pusher config response");
        }

        if (cancelled) return;

        // Lazy-load pusher-js
        const PusherModule = await import("pusher-js");
        const PusherConstructor = PusherModule.default;

        // Create Pusher instance with custom channel authorization
        // that sends cookies (credentials: include) for cross-origin auth
        const pusher = new PusherConstructor(pusherKey, {
          cluster,
          channelAuthorization: {
            customHandler: (params: any, callback: any) => {
              fetch(`${baseUrl}pusher/auth`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  socket_id: params.socketId,
                  channel_name: params.channelName,
                }),
              })
                .then((res) => res.json())
                .then((json) => {
                  if (json?.success && json?.data?.auth) {
                    callback(null, json.data);
                  } else {
                    callback(new Error(json?.message || "Auth failed"));
                  }
                })
                .catch((err) => callback(err));
            },
          },
          enabledTransports: ["ws", "wss"],
        });

        // Handle connection state
        pusher.connection.bind("state_change", (states: { previous: string; current: string }) => {
          if (states.current === "connected") {
            setIsConnected(true);
          } else if (states.current === "disconnected" || states.current === "failed") {
            setIsConnected(false);
          }
        });

        pusher.connection.bind("connected", () => {
          console.log("[Pusher] Connected");
          setIsConnected(true);
        });

        pusher.connection.bind("disconnected", () => {
          console.log("[Pusher] Disconnected");
          setIsConnected(false);
        });

        pusher.connection.bind("failed", () => {
          console.error("[Pusher] Connection failed");
          setIsConnected(false);
        });

        // Subscribe to personal channel for receiving events
        const userId = auth._id;
        if (userId) {
          const personalChannel = pusher.subscribe(`private-user-${userId}`);

          // Route incoming events to registered callbacks
          const routeEvent = (eventName: string, eventData: any) => {
            // Parse the event data — Pusher wraps it in { event, data }
            const parsed = typeof eventData === "string" ? (() => { try { return JSON.parse(eventData); } catch { return { event: eventName, data: eventData }; } })() : eventData;
            const event = parsed.event || eventName;
            const data = parsed.data ?? parsed;

            // Route to topic-specific callbacks
            const callbacks = eventCallbacksRef.current.get(event);
            if (callbacks) {
              callbacks.forEach((cb) => cb(data));
            }

            // Route to convenience callbacks
            switch (event) {
              case "new_message":
                newMessageCallbacksRef.current.forEach((cb) => cb(data));
                break;
              case "user_typing":
                userTypingCallbacksRef.current.forEach((cb) => cb(data));
                break;
              case "messages_read":
                messagesReadCallbacksRef.current.forEach((cb) => cb(data));
                break;
              case "notification:new":
                newNotificationCallbacksRef.current.forEach((cb) => cb(data));
                break;
            }
          };

          // Listen for all relevant events on the personal channel
          const eventsToListen = [
            "new_message",
            "user_typing",
            "messages_read",
            "notification:new",
            "tracking:status",
            "tracking:location",
            "tracking:assignment",
            "tracking:destination",
            "presence_snapshot",
            "presence_update",
            "marketplace:new_job",
          ];

          eventsToListen.forEach((eventName) => {
            personalChannel.bind(eventName, (data: any) => {
              routeEvent(eventName, data);
            });
          });

          // Admin presence channel (Pusher presence channel — tracks members)
          // Converts Pusher's native member_added/member_removed events into
          // the same presence_snapshot/presence_update events that the
          // Online Users page already listens for.
          if (auth.role === "admin" || auth.role === "superadmin") {
            const adminChannel = pusher.subscribe("presence-admin-presence");

            // When subscription succeeds, Pusher delivers the full member list
            adminChannel.bind("pusher:subscription_succeeded", () => {
              const members: Array<{ id: string; info: any }> = [];
              (adminChannel as any).members?.each((member: any) => {
                members.push({ id: member.id, info: member.info });
              });
              // Emit as presence_snapshot — same event name the Online Users page expects
              routeEvent("presence_snapshot", {
                userIds: members.map((m) => m.id),
                users: members.map((m) => ({
                  _id: m.id,
                  username: m.info?.name || "Unknown",
                  email: m.info?.email || "",
                  profilePic: m.info?.profilePic || "",
                  role: m.info?.role || "user",
                })),
              });
            });

            // A new member joined the presence channel
            adminChannel.bind("pusher:member_added", (member: any) => {
              routeEvent("presence_update", {
                userId: member.id,
                online: true,
                user: {
                  _id: member.id,
                  username: member.info?.name || "Unknown",
                  email: member.info?.email || "",
                  profilePic: member.info?.profilePic || "",
                  role: member.info?.role || "user",
                },
              });
            });

            // A member left the presence channel
            adminChannel.bind("pusher:member_removed", (member: any) => {
              routeEvent("presence_update", {
                userId: member.id,
                online: false,
              });
            });
          }
        }

        if (cancelled) {
          pusher.disconnect();
          return;
        }

        pusherRef.current = pusher;
        connectingRef.current = false;

        // Start presence heartbeat — periodically reports online status to the
        // admin presence channel. Only roles that are actually tracked there
        // (admin / superadmin) may send it; ordinary customers have no presence
        // entry, so a heartbeat for them is pure wasted traffic.
        const tracksPresence =
          auth.role === "admin" || auth.role === "superadmin";
        const heartbeatInterval: ReturnType<typeof setInterval> | null =
          tracksPresence
            ? setInterval(() => {
                fetch(`${baseUrl}admin/presence/heartbeat`, {
                  method: "POST",
                  credentials: "include",
                }).catch(() => {});
              }, 60000) // every 60 seconds
            : null;

        // Store for cleanup
        (pusher as any)._heartbeatInterval = heartbeatInterval;
      } catch (err) {
        console.error(`[Pusher] Connection attempt ${attempt}/${PUSHER_MAX_CONNECT_ATTEMPTS} failed:`, err);
        setIsConnected(false);

        if (cancelled) return;

        if (attempt < PUSHER_MAX_CONNECT_ATTEMPTS) {
          const delay = PUSHER_CONNECT_RETRY_DELAYS_MS[attempt - 1] ?? 8000;
          console.warn(`[Pusher] Retrying in ${delay / 1000}s…`);
          retryTimer = setTimeout(() => {
            if (!cancelled) tryConnect();
          }, delay);
        } else {
          console.error("[Pusher] Realtime unavailable after repeated failures — continuing without it.");
          connectingRef.current = false;
        }
      }
    };

    // Delay connection slightly (same pattern as old provider)
    const connectTimer = setTimeout(() => {
      if (!cancelled) tryConnect();
    }, 400);

    return () => {
      cancelled = true;
      connectingRef.current = false;
      clearTimeout(connectTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (pusherRef.current) {
        if ((pusherRef.current as any)._heartbeatInterval) {
          clearInterval((pusherRef.current as any)._heartbeatInterval);
        }
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
      setIsConnected(false);
    };
  }, [auth.username, auth.isVerified, auth._id, auth.role]);

  // ── Socket.IO compatibility shim ──
  const socket = useRef({
    emit: (event: string, ...args: any[]) => emit(event, args[0]),
    on: (event: string, handler: (data: any) => void) => on(event, handler),
    off: (event: string, handler: (data: any) => void) => off(event, handler),
    connected: false,
    get id() {
      try {
        return (pusherRef.current as any)?.connection?.socket_id || null;
      } catch {
        return null;
      }
    },
  }).current;
  socket.connected = isConnected;

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        emit,
        on,
        off,
        onNewMessage,
        offNewMessage,
        onUserTyping,
        offUserTyping,
        onMessagesRead,
        offMessagesRead,
        onNewNotification,
        offNewNotification,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

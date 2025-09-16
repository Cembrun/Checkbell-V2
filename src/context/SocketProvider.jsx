/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  // create a singleton socket for the whole app
  const socket = useMemo(() => {
    // Prefer Vite env var VITE_BACKEND_URL if provided (set in production),
    // otherwise connect to same origin so frontend+backend can be served together.
    const backendUrl = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');
    const s = io(backendUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      forceNew: false,
      upgrade: true,
      rememberUpgrade: true,
      // CORS related options
      withCredentials: true,
      extraHeaders: {
        'Access-Control-Allow-Origin': '*'
      }
    });
    return s;
  }, []);


  useEffect(() => {
    if (!socket) return;
    // Einteilung feature removed — do not auto-join an Einteilung room here.
    const onConnect = () => {
      // kept intentionally empty to avoid emitting deprecated room joins
    };
    socket.on('connect', onConnect);

    // TEST: Empfange Test-Event vom Server
    const onTest = (msg) => {
      console.log('[Socket] Test-Event empfangen:', msg);
      alert('Socket Test-Event: ' + msg);
    };
    socket.on('test', onTest);

    return () => {
      socket.off('connect', onConnect);
      socket.off('test', onTest);
      // do not disconnect here — keep connection for app lifetime
    };
  }, [socket]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

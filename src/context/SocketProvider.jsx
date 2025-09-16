/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect } from 'react';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  // Temporarily disable Socket.IO to stop the error spam
  const socket = null;

  useEffect(() => {
    // Socket temporarily disabled to stop error spam
    console.log('[Socket] Socket.IO temporarily disabled to stop error spam');
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketProvider';

export default function SocketTestMessage() {
  const socket = useSocket();

  useEffect(() => {
    // Socket.IO is temporarily disabled
    console.log('[SocketTestMessage] Socket.IO disabled - no connection attempts');
  }, []);

  return (
    <div style={{ background: '#222', color: '#fff', padding: 16, borderRadius: 8, margin: 16 }}>
      <strong>Socket Status:</strong> Temporarily disabled to prevent errors
    </div>
  );
}

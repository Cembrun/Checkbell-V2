import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketProvider';

export default function SocketTestMessage() {
  const socket = useSocket();
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!socket) return;
    const onTest = (msg) => setMessage(msg);
    socket.on('test', onTest);
    return () => socket.off('test', onTest);
  }, [socket]);

  return (
    <div style={{ background: '#222', color: '#fff', padding: 16, borderRadius: 8, margin: 16 }}>
      <strong>Socket Test-Event:</strong> {message ? message : 'Noch keine Nachricht empfangen.'}
    </div>
  );
}

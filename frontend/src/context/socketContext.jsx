import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // No user = no socket
    if (!user) {
      if (socketRef.current) {
        console.log('[Socket] User logged out, disconnecting...');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }

    // Already have a connected socket - reuse it
    if (socketRef.current?.connected) {
      console.log('[Socket] Reusing existing connection:', socketRef.current.id);
      setConnected(true);
      return;
    }

    // Create new socket connection
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

    console.log('[Socket] Creating new connection to:', SOCKET_URL);
    console.log('[Socket] User:', user.username, 'Role:', user.role);

    const token = localStorage.getItem('token');

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      auth: {
        username: user.username,
        role: user.role,
        token
      }
    });

    // Connection handlers
    newSocket.on('connect', () => {
      console.log('[Socket]  Connected:', newSocket.id);
      setConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] ⚠️ Disconnected:', reason);
      setConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] 🔄 Reconnected after', attemptNumber, 'attempts');
      setConnected(true);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] ❌ Connection error:', error.message);
      setConnected(false);
    });

    socketRef.current = newSocket;

    // Cleanup ONLY when user changes or logs out
    return () => {
      console.log('[Socket] Cleanup - user changed');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [user?.username]); // Only recreate if username changes (login/logout)

  const joinDebateRoom = (debateId) => {
    if (socketRef.current?.connected) {
      console.log('[Socket] Joining debate room:', debateId);
      socketRef.current.emit('join:debate', debateId);
    } else {
      console.warn('[Socket] Cannot join room - not connected');
    }
  };

  const leaveDebateRoom = (debateId) => {
    if (socketRef.current?.connected) {
      console.log('[Socket] Leaving debate room:', debateId);
      socketRef.current.emit('leave:debate', debateId);
    }
  };

  const handleEarlyEndVote = (data) => {
  if (data.debateId === debate._id) {
    console.log('[DebateRoom] Early end vote update');
    setEarlyEndVotes(data.votes);

    // Check if both voted
    if (data.votes.player1Voted && data.votes.player2Voted) {
      toast.success('Both players agreed - debate ending early!');
      fetchDebate();
    }
  }
};

  const value = {
    socket: socketRef.current,
    connected,
    joinDebateRoom,
    leaveDebateRoom
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

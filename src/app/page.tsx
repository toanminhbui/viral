// src/app/page.tsx
'use client';

import { Canvas } from '@/components/Canvas/Canvas';
import { Toolbar } from '@/components/Canvas/Toolbar';
import { UserList } from '@/components/Canvas/UserList';
import { useState, useEffect } from 'react';

// Define User interface to match what UserList expects
interface User {
  id: string;
  name: string;
  position: { x: number; y: number };
}

export default function Home() {
  const [mode, setMode] = useState<'draw' | 'text' | 'pan'>('draw');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(2);
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [hasEnteredName, setHasEnteredName] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load username from localStorage on initial render
  useEffect(() => {
    const savedUsername = localStorage.getItem('canvas_username');
    if (savedUsername) {
      setUsername(savedUsername);
      setHasEnteredName(true);
    }
    setIsLoading(false);
  }, []);

  // Update connected users when username changes
  useEffect(() => {
    if (username) {
      // Add current user to the list
      setUsers(prevUsers => {
        // Check if user already exists
        if (!prevUsers.some(user => user.id === username)) {
          return [...prevUsers, { 
            id: username, 
            name: username, 
            position: { x: 500, y: 500 } // Initial position in the center
          }];
        }
        return prevUsers;
      });
    }
  }, [username]);

  // Save username to localStorage when user joins
  const handleJoinCanvas = () => {
    if (username.trim()) {
      localStorage.setItem('canvas_username', username);
      setHasEnteredName(true);
    }
  };

  if (isLoading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  if (!hasEnteredName) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4">Welcome to Collaborative Canvas</h1>
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="px-4 py-2 border rounded w-full mb-4"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && username.trim()) {
                handleJoinCanvas();
              }
            }}
          />
          <button
            onClick={handleJoinCanvas}
            disabled={!username.trim()}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-300 transition-colors"
          >
            Join Canvas
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="w-screen h-screen relative">
      <Canvas
        type={mode}
        color={color}
        width={width}
        username={username}
      />
      <Toolbar
        mode={mode}
        onModeChange={setMode}
        onColorChange={setColor}
        onWidthChange={setWidth}
      />
      <UserList users={users} />
    </main>
  );
}
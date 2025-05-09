// src/components/Canvas/Canvas.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { CanvasElement } from '@/types/index';

interface CanvasProps {
  type: 'draw' | 'text' | 'pan';
  color: string;
  width: number;
  username: string;
}

export const Canvas: React.FC<CanvasProps> = ({ type, color, width, username }) => {
  // Refs for DOM elements and drawing state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef({ x: 500, y: 500 });
  const currentPathRef = useRef<{x: number, y: number}[]>([]);
  
  // State that affects rendering
  const [mode, setMode] = useState<'draw' | 'text' | 'pan'>(type);
  const [loading, setLoading] = useState(false);
  const [localDrawings, setLocalDrawings] = useState<CanvasElement[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<string[]>([]);  // New state for all registered users
  const [debugInfo, setDebugInfo] = useState<string>('');
  
  // Text editing state
  const [textPosition, setTextPosition] = useState<{x: number, y: number} | null>(null);
  const [textContent, setTextContent] = useState('');
  const [editingText, setEditingText] = useState(false);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  
  // Fixed scale (zoom disabled) and mutable offset for panning
  // Initial offset set to center of canvas (500, 500)
  const offsetRef = useRef({ x: 500, y: 500 });

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Convert screen coordinates to canvas coordinates
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    
    // Since scale is fixed at 1, we only need to account for panning
    const worldX = canvasX - offsetRef.current.x;
    const worldY = canvasY - offsetRef.current.y;
    
    return { x: worldX, y: worldY };
  }, []);

  // Redraw the canvas with current transforms and all stored drawings
  const redrawCanvas = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply panning transform (no scaling)
    ctx.save();
    ctx.translate(offsetRef.current.x, offsetRef.current.y);
    
    // Draw all saved elements
    localDrawings.forEach(drawing => {
      if (drawing.type === 'draw' && drawing.data.points && drawing.data.points.length > 1) {
        ctx.strokeStyle = drawing.data.color || color;
        ctx.lineWidth = drawing.data.width || width;
        
        ctx.beginPath();
        const points = drawing.data.points;
        ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        
        ctx.stroke();
      } else if (drawing.type === 'text' && drawing.data.text && drawing.data.position) {
        // Skip currently editing text as it's handled by the textarea
        if (editingText && drawing.id === activeTextId) return;
        
        const position = drawing.data.position;
        const text = drawing.data.text;
        
        ctx.font = '16px Arial';
        ctx.fillStyle = drawing.data.color || color;
        ctx.fillText(text, position.x, position.y);
      }
    });
    
    // Draw current path if drawing
    if (isDrawingRef.current && currentPathRef.current.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      
      ctx.beginPath();
      ctx.moveTo(currentPathRef.current[0].x, currentPathRef.current[0].y);
      
      for (let i = 1; i < currentPathRef.current.length; i++) {
        ctx.lineTo(currentPathRef.current[i].x, currentPathRef.current[i].y);
      }
      
      ctx.stroke();
    }
    
    ctx.restore();
    
    // Avoid updating debug info during redrawing to prevent potential infinite loops
  }, [localDrawings, color, width, editingText, activeTextId]);

  // Draw a single element without redrawing the entire canvas
  const drawSingleElement = useCallback((element: CanvasElement) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    
    ctx.save();
    ctx.translate(offsetRef.current.x, offsetRef.current.y);
    
    if (element.type === 'draw' && element.data.points && element.data.points.length >= 2) {
      ctx.strokeStyle = element.data.color || color;
      ctx.lineWidth = element.data.width || width;
      
      ctx.beginPath();
      const points = element.data.points;
      ctx.moveTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      
      ctx.stroke();
    } else if (element.type === 'text' && element.data.text && element.data.position) {
      const position = element.data.position;
      const text = element.data.text;
      
      ctx.font = '16px Arial';
      ctx.fillStyle = element.data.color || color;
      ctx.fillText(text, position.x, position.y);
    }
    
    ctx.restore();
  // Only include stable dependencies in useCallback
  }, [color, width]);

  // Save a new drawing to local state and Supabase
  const saveDrawing = async (points: {x: number, y: number}[]) => {
    if (points.length < 1) return;
    
    const elementId = Date.now().toString();
    const timestamp = Date.now();
    
    const element: CanvasElement = {
      id: elementId,
      type: 'draw',
      data: {
        points,
        color,
        width
      },
      userId: username,
      timestamp
    };
    
    // Add to local drawings
    setLocalDrawings(prev => [...prev, element]);
    
    // Save to Supabase
    try {
      const insertData = {
        id: elementId,
        type: 'draw',
        user_id: username || 'anonymous',
        timestamp,
        data: element.data
      };
      
      const { error } = await supabase
        .from('canvas_elements')
        .insert(insertData);
        
      if (error) {
        console.error('Save error:', error);
        setDebugInfo(`Save error: ${error.message}`);
      } else {
        setDebugInfo('Drawing saved');
      }
    } catch (err) {
      console.error('Exception in save:', err);
    }
  };

  // Save a text element
  const saveTextElement = async (text: string, position: {x: number, y: number}) => {
    const elementId = Date.now().toString();
    const timestamp = Date.now();
    
    const element: CanvasElement = {
      id: elementId,
      type: 'text',
      data: {
        text,
        position,
        color
      },
      userId: username,
      timestamp
    };
    
    // Add to local drawings
    setLocalDrawings(prev => [...prev, element]);
    
    // Save to Supabase
    try {
      const insertData = {
        id: elementId,
        type: 'text',
        user_id: username || 'anonymous',
        timestamp,
        data: element.data
      };
      
      const { error } = await supabase
        .from('canvas_elements')
        .insert(insertData);
        
      if (error) {
        console.error('Save text error:', error);
        setDebugInfo(`Save text error: ${error.message}`);
      } else {
        setDebugInfo(`Text added: "${text.substring(0, 15)}${text.length > 15 ? '...' : ''}"`);
      }
    } catch (err) {
      console.error('Exception in text save:', err);
    }
  };
  
  // Update an existing text element
  const updateTextElement = async (id: string, text: string, position: {x: number, y: number}) => {
    // Update local state
    setLocalDrawings(prev => 
      prev.map(element => 
        element.id === id 
          ? {
              ...element,
              data: {
                ...element.data,
                text,
                position
              }
            }
          : element
      )
    );
    
    // Update in Supabase
    try {
      const { error } = await supabase
        .from('canvas_elements')
        .update({ 
          data: {
            text,
            position,
            color
          }
        })
        .eq('id', id);
        
      if (error) {
        console.error('Update text error:', error);
        setDebugInfo(`Update text error: ${error.message}`);
      } else {
        setDebugInfo(`Text updated: "${text.substring(0, 15)}${text.length > 15 ? '...' : ''}"`);
      }
    } catch (err) {
      console.error('Exception in text update:', err);
    }
  };

  // Finish text editing and save
  const finishTextEditing = useCallback(() => {
    if (!textPosition || !textContent.trim()) {
      setEditingText(false);
      setTextPosition(null);
      setTextContent('');
      setActiveTextId(null);
      return;
    }
    
    const text = textContent.trim();
    
    if (activeTextId) {
      // Update existing text
      updateTextElement(activeTextId, text, textPosition);
    } else {
      // Create new text
      saveTextElement(text, textPosition);
    }
    
    setEditingText(false);
    setTextPosition(null);
    setTextContent('');
    setActiveTextId(null);
  }, [textPosition, textContent, activeTextId, saveTextElement, updateTextElement]);

  // Check if a text element was clicked for editing
  const checkTextElementClick = useCallback((point: {x: number, y: number}) => {
    if (editingText) return false;
    
    // Check if any text element was clicked
    for (let i = localDrawings.length - 1; i >= 0; i--) {
      const element = localDrawings[i];
      if (element.type === 'text' && element.data.position && element.data.text) {
        const position = element.data.position;
        
        // Simple hit detection - text size is approximately 16px height, width depends on text length
        const textWidth = element.data.text.length * 8; // Approximate width calculation
        const textHeight = 20;
        
        if (
          point.x >= position.x - 5 && 
          point.x <= position.x + textWidth + 5 && 
          point.y >= position.y - textHeight - 5 && 
          point.y <= position.y + 5
        ) {
          // Text element clicked, start editing
          setTextPosition(position);
          setTextContent(element.data.text);
          setEditingText(true);
          setActiveTextId(element.id);
          setDebugInfo(`Editing text (ID: ${element.id.slice(0, 6)})`);
          return true;
        }
      }
    }
    return false;
  }, [localDrawings, editingText]);

  // Start drawing or place text
  const startDrawing = useCallback((e: React.MouseEvent) => {
    // If already editing text, finish it first
    if (editingText) {
      finishTextEditing();
      return;
    }
    
    // Handle panning in pan mode
    if (mode === 'pan') {
      isPanningRef.current = true;
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing';
      }
      return;
    }
    
    // Handle text placement in text mode
    if (mode === 'text') {
      const point = screenToWorld(e.clientX, e.clientY);
      setTextPosition(point);
      setTextContent('');
      setEditingText(true);
      setActiveTextId(null);
      setDebugInfo('Adding text. Type and press Enter to save.');
      return;
    }
    
    if (mode !== 'draw') return;
    
    // Get world coordinates
    const point = screenToWorld(e.clientX, e.clientY);
    
    isDrawingRef.current = true;
    currentPathRef.current = [point];
    
    // Draw initial dot
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.save();
      ctx.translate(offsetRef.current.x, offsetRef.current.y);
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      
      ctx.restore();
    }
  }, [mode, screenToWorld, color, width, editingText, finishTextEditing]);

  const draw = useCallback((e: React.MouseEvent) => {
    // Handle panning
    if (isPanningRef.current && mode === 'pan') {
      const dx = e.clientX - lastPanPointRef.current.x;
      const dy = e.clientY - lastPanPointRef.current.y;
      
      // Update offset directly without state update
      offsetRef.current = {
        x: offsetRef.current.x + dx,
        y: offsetRef.current.y + dy
      };
      
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      
      // Redraw with new offset without updating state
      redrawCanvas();
      return;
    }
    
    if (!isDrawingRef.current || mode !== 'draw') return;
    
    // Get world coordinates
    const point = screenToWorld(e.clientX, e.clientY);
    
    // Add to current path without updating state
    const ctx = ctxRef.current;
    if (ctx && currentPathRef.current.length > 0) {
      const prevPoint = currentPathRef.current[currentPathRef.current.length - 1];
      
      ctx.save();
      ctx.translate(offsetRef.current.x, offsetRef.current.y);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(prevPoint.x, prevPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      
      ctx.restore();
    }
    
    // Update current path ref without state update
    currentPathRef.current.push(point);
  }, [mode, screenToWorld, redrawCanvas, color, width]);

  const stopDrawing = useCallback((e: React.MouseEvent) => {
    // End panning
    if (isPanningRef.current && mode === 'pan') {
      isPanningRef.current = false;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grab';
      }
      
      // Check if a text element was clicked for editing
      if (Math.abs(e.clientX - lastPanPointRef.current.x) < 5 && Math.abs(e.clientY - lastPanPointRef.current.y) < 5) {
        const point = screenToWorld(e.clientX, e.clientY);
        checkTextElementClick(point);
        return;
      }
      
      return;
    }
    
    if (!isDrawingRef.current) return;
    
    isDrawingRef.current = false;
    
    // Save the drawing if points exist
    if (currentPathRef.current.length > 0) {
      saveDrawing(currentPathRef.current);
      currentPathRef.current = [];
    }
  }, [mode, checkTextElementClick, screenToWorld, saveDrawing]);
  
  // Reset pan position
  const resetView = useCallback(() => {
    offsetRef.current = { x: 500, y: 500 };
    redrawCanvas();
    // Avoid setState in functions called by useEffect
    // setDebugInfo('View reset');
  }, [redrawCanvas]);

  // Update drawing mode when type prop changes
  useEffect(() => {
    setMode(type);
    
    // Update cursor based on mode
    if (canvasRef.current) {
      if (type === 'pan') {
        canvasRef.current.style.cursor = 'grab';
      } else if (type === 'draw') {
        canvasRef.current.style.cursor = 'crosshair';
      } else {
        canvasRef.current.style.cursor = 'text';
      }
    }
    
    // Clear active text editing when changing modes
    if (type !== 'text' && editingText) {
      finishTextEditing();
    }
  }, [type, editingText, finishTextEditing]);

  // Initialize canvas once on mount
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    
    // Set canvas dimensions
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Store context in ref for future use
      ctxRef.current = ctx;
      
      // Initialize drawing styles
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      
      // Draw test line
      ctx.beginPath();
      ctx.moveTo(50, 50);
      ctx.lineTo(100, 100);
      ctx.stroke();
    }
  }, [color, width]);

  // Update stroke style when color or width changes
  useEffect(() => {
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
    }
  }, [color, width]);

  // Use polling instead of localStorage caching for drawings
  const isInitialLoadRef = useRef(true);
  // Counter for polling to track debug info
  const pollCountRef = useRef(0);
  
  // Function to load all registered users from database
  const loadAllUsers = useCallback(async () => {
    try {
      console.log('Loading all users...');
      
      // Get unique user IDs from canvas_elements
      const { data, error } = await supabase
        .from('canvas_elements')
        .select('user_id');
        
      if (error) {
        console.error('Error loading users:', error);
      } else if (data) {
        // Extract unique user IDs
        const uniqueUsers = Array.from(new Set(data.map(item => item.user_id)));
        setAllUsers(uniqueUsers);
        console.log(`Loaded ${uniqueUsers.length} users`);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, []);
  
  // Poll for new drawings from database at regular intervals
  useEffect(() => {
    // Skip if canvas ref isn't ready yet
    if (!canvasRef.current) return;
    
    // Load drawings from database - defined inside useEffect to avoid dependency issues
    const loadDrawingsFromDatabase = async () => {
      try {
        // Don't call setDebugInfo to avoid triggering re-renders
        // Instead, log to console for debugging
        console.log('Loading drawings...');
        
        const { data, error } = await supabase
          .from('canvas_elements')
          .select('*')
          .order('timestamp', { ascending: true });
          
        if (error) {
          console.error('Error loading drawings:', error);
          // Don't call setDebugInfo here
        } else if (data) {
          // Convert to our format
          const drawings = data.map(item => ({
            id: item.id,
            type: item.type as 'draw' | 'text',
            data: item.data,
            userId: item.user_id,
            timestamp: item.timestamp
          }));
          
          // Extract unique user IDs
          const uniqueUsers = Array.from(new Set(data.map(item => item.user_id)));
          setAllUsers(uniqueUsers);
          
          // Update state without triggering dependency loops
          setLocalDrawings(drawings);
          
          if (isInitialLoadRef.current) {
            console.log(`Loaded ${drawings.length} drawings from ${uniqueUsers.length} users`);
            // Only update UI debug info on initial load
            setDebugInfo(`Loaded ${drawings.length} drawings from ${uniqueUsers.length} users`);
            isInitialLoadRef.current = false;
          } else {
            pollCountRef.current += 1;
            console.log(`Poll #${pollCountRef.current}: Refreshed ${drawings.length} drawings`);
            // Don't update debug info on regular polls
          }
          
          // Safe way to redraw canvas to avoid infinite loops
          if (ctxRef.current) {
            const ctx = ctxRef.current;
            const canvas = canvasRef.current;
            if (!ctx || !canvas) return;
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Apply panning transform (no scaling)
            ctx.save();
            ctx.translate(offsetRef.current.x, offsetRef.current.y);
            
            // Draw all saved elements
            drawings.forEach(drawing => {
              if (drawing.type === 'draw' && drawing.data.points && drawing.data.points.length > 1) {
                ctx.strokeStyle = drawing.data.color || color;
                ctx.lineWidth = drawing.data.width || width;
                
                ctx.beginPath();
                const points = drawing.data.points;
                ctx.moveTo(points[0].x, points[0].y);
                
                for (let i = 1; i < points.length; i++) {
                  ctx.lineTo(points[i].x, points[i].y);
                }
                
                ctx.stroke();
              } else if (drawing.type === 'text' && drawing.data.text && drawing.data.position) {
                // Skip currently editing text as it's handled by the textarea
                if (editingText && drawing.id === activeTextId) return;
                
                const position = drawing.data.position;
                const text = drawing.data.text;
                
                ctx.font = '16px Arial';
                ctx.fillStyle = drawing.data.color || color;
                ctx.fillText(text, position.x, position.y);
              }
            });
            
            ctx.restore();
          }
        }
      } catch (err) {
        console.error('Failed to load drawings:', err);
      } finally {
        // Only update loading state on initial load to prevent re-renders
        if (isInitialLoadRef.current) {
          setLoading(false);
        }
      }
    };
    
    // Setup realtime subscription
    const setupSubscription = () => {
      const channel = supabase
        .channel('canvas-changes')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'canvas_elements' }, 
          (payload) => {
            // Only process if not from current user
            if (payload.new && payload.new.user_id !== username) {
              const newDrawing: CanvasElement = {
                id: payload.new.id,
                type: payload.new.type as 'draw' | 'text',
                data: payload.new.data,
                userId: payload.new.user_id,
                timestamp: payload.new.timestamp
              };
              
              // Add to state without triggering unnecessary re-renders
              setLocalDrawings(prev => {
                const updated = [...prev, newDrawing];
                // Draw directly to canvas without state update
                if (ctxRef.current) {
                  // Directly draw the new element
                  const ctx = ctxRef.current;
                  ctx.save();
                  ctx.translate(offsetRef.current.x, offsetRef.current.y);
                  
                  if (newDrawing.type === 'draw' && newDrawing.data.points && newDrawing.data.points.length >= 2) {
                    ctx.strokeStyle = newDrawing.data.color || color;
                    ctx.lineWidth = newDrawing.data.width || width;
                    
                    ctx.beginPath();
                    const points = newDrawing.data.points;
                    ctx.moveTo(points[0].x, points[0].y);
                    
                    for (let i = 1; i < points.length; i++) {
                      ctx.lineTo(points[i].x, points[i].y);
                    }
                    
                    ctx.stroke();
                  } else if (newDrawing.type === 'text' && newDrawing.data.text && newDrawing.data.position) {
                    const position = newDrawing.data.position;
                    const text = newDrawing.data.text;
                    
                    ctx.font = '16px Arial';
                    ctx.fillStyle = newDrawing.data.color || color;
                    ctx.fillText(text, position.x, position.y);
                  }
                  
                  ctx.restore();
                }
                return updated;
              });
              
              // Update connected users
              setConnectedUsers(prev => 
                prev.includes(newDrawing.userId) 
                  ? prev 
                  : [...prev, newDrawing.userId]
              );
              
              // Add to all users if not already there
              setAllUsers(prev => 
                prev.includes(newDrawing.userId)
                  ? prev
                  : [...prev, newDrawing.userId]
              );
            }
          }
        )
        .subscribe();
        
      return () => {
        channel.unsubscribe();
      };
    };
    
    // Initial load
    loadDrawingsFromDatabase();
    
    // Setup subscription 
    const unsubscribe = setupSubscription();
    
    // Set up polling every 30 seconds
    const pollingInterval = setInterval(() => {
      loadDrawingsFromDatabase();
    }, 30000); // 30 seconds
    
    // Cleanup function
    return () => {
      clearInterval(pollingInterval);
      unsubscribe();
    };
  // Use an empty dependency array to ensure this only runs once on mount
  }, []);

  // Focus text input when editing begins
  useEffect(() => {
    if (editingText && textInputRef.current) {
      textInputRef.current.focus();
      
      // Set timeout to ensure DOM is updated before focusing
      setTimeout(() => {
        if (textInputRef.current) {
          textInputRef.current.focus();
          // Put cursor at the end of text
          textInputRef.current.setSelectionRange(
            textContent.length,
            textContent.length
          );
        }
      }, 10);
    }
  }, [editingText, textContent]);

  // Function for cancelling text edit with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingText) {
        setEditingText(false);
        setTextPosition(null);
        setTextContent('');
        setActiveTextId(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingText]);

  // Load all users initially and periodically
  useEffect(() => {
    // Initial load
    loadAllUsers();
    
    // Refresh every minute
    const interval = setInterval(() => {
      loadAllUsers();
    }, 60000);
    
    // Cleanup
    return () => clearInterval(interval);
  }, [loadAllUsers]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="relative w-full h-full overflow-hidden" ref={containerRef}>
      {/* Info panel */}
      <div className="absolute top-2 left-2 bg-white p-2 rounded shadow z-20">
        <div>Mode: {mode} | {mode === 'pan' ? 'Panning enabled' : mode === 'text' ? 'Text mode' : 'Drawing enabled'}</div>
        {debugInfo && <div className="text-xs text-gray-500 mt-1">{debugInfo}</div>}
        <button 
          onClick={resetView}
          className="mt-1 text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
        >
          Reset Position
        </button>
      </div>
      
      {/* Users panel */}
      <div className="absolute bottom-24 left-2 bg-white p-2 rounded shadow z-20 max-w-xs">
        {/* Active users section */}
        {connectedUsers.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-bold mb-1">Active Users ({connectedUsers.length}):</div>
            <div className="max-h-24 overflow-y-auto">
              {connectedUsers.map(user => (
                <div key={user} className="text-xs flex items-center gap-1 py-0.5">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  {user}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* All registered users section */}
        {allUsers.length > 0 && (
          <div>
            <div className="text-xs font-bold mb-1">All Registered Users ({allUsers.length}):</div>
            <div className="max-h-36 overflow-y-auto">
              {allUsers.map(user => (
                <div key={user} className="text-xs flex items-center gap-1 py-0.5">
                  <div className={`w-2 h-2 ${connectedUsers.includes(user) ? 'bg-green-500' : 'bg-gray-300'} rounded-full`}></div>
                  {user} {user === username && '(you)'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Text input for editing */}
      {editingText && textPosition && (
        <div 
          className="absolute z-30"
          style={{
            left: `${textPosition.x + offsetRef.current.x}px`,
            top: `${textPosition.y + offsetRef.current.y - 25}px`,
            position: 'absolute'
          }}
        >
          <textarea
            ref={textInputRef}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            onBlur={finishTextEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishTextEditing();
              }
            }}
            placeholder="Enter text here..."
            className="border-2 border-blue-500 focus:border-blue-600 focus:ring-2 focus:ring-blue-300 p-2 text-sm min-w-[150px] min-h-[60px] max-w-[300px] rounded shadow-lg"
            autoFocus
            style={{ color }}
          />
          <div className="text-xs text-center mt-1 bg-white px-1 py-0.5 rounded text-gray-600">
            Press Enter to save, Escape to cancel
          </div>
        </div>
      )}
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 border border-gray-300"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      />
    </div>
  );
};
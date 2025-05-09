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

  // Load data from Supabase once on mount - using ref to track mounting state
  const isInitialLoadRef = useRef(true);
  
  useEffect(() => {
    // Only run this effect on initial mount
    if (!isInitialLoadRef.current) return;
    // Turn off the initial load flag after first run
    isInitialLoadRef.current = false;
    
    // Skip if canvas ref isn't ready yet
    if (!canvasRef.current) return;
    
    // Flag to track if we've already loaded drawings
    const hasLoadedData = localStorage.getItem('canvas_data_loaded');
    const lastLoadTime = localStorage.getItem('canvas_last_load_time');
    const currentTime = Date.now();
    const oneHourInMs = 60 * 60 * 1000;
    
    // Only load drawings if it hasn't been loaded yet or it's been more than an hour
    const shouldLoadDrawings = !hasLoadedData || 
      !lastLoadTime || 
      (currentTime - parseInt(lastLoadTime)) > oneHourInMs;
    
    // Load initial drawings
    const loadDrawings = async () => {
      try {
        setDebugInfo('Loading drawings...');
        
        const { data, error } = await supabase
          .from('canvas_elements')
          .select('*')
          .order('timestamp', { ascending: true });
          
        if (error) {
          console.error('Error loading drawings:', error);
          setDebugInfo(`Error: ${error.message}`);
        } else if (data) {
          // Convert to our format
          const drawings = data.map(item => ({
            id: item.id,
            type: item.type as 'draw' | 'text',
            data: item.data,
            userId: item.user_id,
            timestamp: item.timestamp
          }));
          
          setLocalDrawings(drawings);
          setDebugInfo(`Loaded ${drawings.length} drawings`);
          
          // Save to localStorage to prevent reloading
          localStorage.setItem('canvas_data_loaded', 'true');
          localStorage.setItem('canvas_last_load_time', currentTime.toString());
          
          // Draw all elements - use redrawCanvas without triggering another render
          if (ctxRef.current) {
            redrawCanvas();
          }
        }
      } catch (err) {
        console.error('Failed to load drawings:', err);
      } finally {
        setLoading(false);
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
                  drawSingleElement(newDrawing);
                }
                return updated;
              });
              
              // Update connected users
              setConnectedUsers(prev => 
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
    
    // Only load drawings if needed
    if (shouldLoadDrawings) {
      loadDrawings();
    } else {
      // If we're not loading from the database, still need to set loading to false
      setLoading(false);
      setDebugInfo('Using cached drawings');
      
      // Try to get drawings from localStorage
      try {
        const cachedDrawings = localStorage.getItem('canvas_drawings');
        if (cachedDrawings) {
          const drawings = JSON.parse(cachedDrawings) as CanvasElement[];
          setLocalDrawings(drawings);
          
          // Draw all elements directly - avoid using setTimeout
          if (ctxRef.current) {
            redrawCanvas();
          }
        }
      } catch (err) {
        console.error('Failed to load cached drawings:', err);
        // If there's an error with cached drawings, load from database
        loadDrawings();
      }
    }
    
    // Setup subscription once
    const unsubscribe = setupSubscription();
    
    // Cleanup function
    return () => {
      unsubscribe();
    };
  // We're using isInitialLoadRef to ensure this only runs once, so no dependencies are needed
  }, []);  // Empty dependency array ensures this only runs once
  
  // Apply drawSingleElement and redrawCanvas separately to avoid dependency cycles
  useEffect(() => {
    // This effect ensures redrawCanvas is available to the data loading effect
    // But it doesn't actually do anything, it just makes the function available
  }, [drawSingleElement, redrawCanvas]);

  // Save drawings to localStorage when they change
  useEffect(() => {
    // Skip initial render or if there are no drawings
    if (localDrawings.length === 0) return;
    
    // Prevent excessive localStorage writes by debouncing
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem('canvas_drawings', JSON.stringify(localDrawings));
      } catch (err) {
        console.error('Failed to cache drawings:', err);
      }
    }, 1000); // Debounce for 1 second
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [localDrawings]);

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
      
      {/* Connected users */}
      {connectedUsers.length > 0 && (
        <div className="absolute bottom-24 left-2 bg-white p-2 rounded shadow z-20 max-w-xs">
          <div className="text-xs font-bold mb-1">Connected Users ({connectedUsers.length}):</div>
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
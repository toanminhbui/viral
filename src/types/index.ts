export interface CanvasElement {
    id: string;
    type: 'draw' | 'text';
    data: {
      points?: Array<{ x: number; y: number }>;
      text?: string;
      position?: { x: number; y: number };
      color?: string;
      width?: number;
    };
    userId: string;
    timestamp: number;
  }
  
  export interface CanvasState {
    elements: CanvasElement[];
    lastModified: number;
    version: number;
  }
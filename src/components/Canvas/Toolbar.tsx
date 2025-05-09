// src/components/Canvas/Toolbar.tsx
'use client';

interface ToolbarProps {
  mode: 'draw' | 'text' | 'pan';
  onModeChange: (mode: 'draw' | 'text' | 'pan') => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  mode,
  onModeChange,
  onColorChange,
  onWidthChange
}) => {
  return (
    <div className="fixed top-4 right-4 bg-white p-4 rounded-lg shadow-lg">
      <div className="flex space-x-2 mb-3">
        <button
          className={`p-2 rounded ${mode === 'draw' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => onModeChange('draw')}
        >
          Draw
        </button>
        <button
          className={`p-2 rounded ${mode === 'text' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => onModeChange('text')}
        >
          Text
        </button>
        <button
          className={`p-2 rounded ${mode === 'pan' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => onModeChange('pan')}
        >
          Pan
        </button>
      </div>
      
      <div className="space-y-3">
        <div className="flex flex-col">
          <label className="text-sm mb-1">Color</label>
          <input
            type="color"
            onChange={(e) => onColorChange(e.target.value)}
            className="w-full h-8"
          />
        </div>
        
        <div className="flex flex-col">
          <label className="text-sm mb-1">Thickness</label>
          <input
            type="range"
            min="1"
            max="20"
            onChange={(e) => onWidthChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};
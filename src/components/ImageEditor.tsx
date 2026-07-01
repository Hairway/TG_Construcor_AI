import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Crop } from 'lucide-react';

interface ImageEditorProps {
  imageSrc: string;
  onConfirm: (croppedImageSrc: string) => void;
  onCancel: () => void;
}

export function ImageEditor({ imageSrc, onConfirm, onCancel }: ImageEditorProps) {
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [startSelection, setStartSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize selection to center 80%
    if (imageRef.current) {
      const img = imageRef.current;
      const w = img.width;
      const h = img.height;
      setSelection({
        x: w * 0.1,
        y: h * 0.1,
        width: w * 0.8,
        height: h * 0.8
      });
    }
  }, [imageSrc]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!selection || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on handles
    const handleSize = 10;
    const handles = {
      nw: { x: selection.x, y: selection.y },
      ne: { x: selection.x + selection.width, y: selection.y },
      sw: { x: selection.x, y: selection.y + selection.height },
      se: { x: selection.x + selection.width, y: selection.y + selection.height }
    };

    for (const [key, pos] of Object.entries(handles)) {
      if (Math.abs(x - pos.x) <= handleSize && Math.abs(y - pos.y) <= handleSize) {
        setResizeHandle(key);
        setIsDragging(true);
        setDragStart({ x, y });
        setStartSelection({ ...selection });
        e.preventDefault();
        return;
      }
    }

    // Check if clicking inside selection to move
    if (x >= selection.x && x <= selection.x + selection.width &&
        y >= selection.y && y <= selection.y + selection.height) {
      setResizeHandle(null); // Move mode
      setIsDragging(true);
      setDragStart({ x, y });
      setStartSelection({ ...selection });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selection || !dragStart || !startSelection || !containerRef.current || !imageRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;

    const imgW = imageRef.current.width;
    const imgH = imageRef.current.height;

    if (resizeHandle) {
      let newX = startSelection.x;
      let newY = startSelection.y;
      let newW = startSelection.width;
      let newH = startSelection.height;

      if (resizeHandle.includes('n')) {
        newY = Math.min(startSelection.y + dy, startSelection.y + startSelection.height - 20);
        newH = startSelection.height - (newY - startSelection.y);
      }
      if (resizeHandle.includes('s')) {
        newH = Math.max(20, startSelection.height + dy);
      }
      if (resizeHandle.includes('w')) {
        newX = Math.min(startSelection.x + dx, startSelection.x + startSelection.width - 20);
        newW = startSelection.width - (newX - startSelection.x);
      }
      if (resizeHandle.includes('e')) {
        newW = Math.max(20, startSelection.width + dx);
      }

      // Constrain to image bounds
      if (newX < 0) { newW += newX; newX = 0; }
      if (newY < 0) { newH += newY; newY = 0; }
      if (newX + newW > imgW) newW = imgW - newX;
      if (newY + newH > imgH) newH = imgH - newY;

      setSelection({ x: newX, y: newY, width: newW, height: newH });
    } else {
      // Move
      let newX = startSelection.x + dx;
      let newY = startSelection.y + dy;

      // Constrain
      newX = Math.max(0, Math.min(newX, imgW - selection.width));
      newY = Math.max(0, Math.min(newY, imgH - selection.height));

      setSelection({ ...selection, x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
    setStartSelection(null);
    setResizeHandle(null);
  };

  const handleConfirm = () => {
    if (!selection || !imageRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // We need to map the displayed selection to the natural image size
    const img = imageRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const cropX = selection.x * scaleX;
    const cropY = selection.y * scaleY;
    const cropW = selection.width * scaleX;
    const cropH = selection.height * scaleY;

    canvas.width = cropW;
    canvas.height = cropH;

    ctx.drawImage(
      img,
      cropX, cropY, cropW, cropH,
      0, 0, cropW, cropH
    );

    onConfirm(canvas.toDataURL());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
      <div className="bg-[#151515] border border-zinc-800 rounded-xl overflow-hidden flex flex-col max-h-full max-w-full shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#1a1a1a]">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Crop size={16} />
            Crop Image
          </h3>
          <div className="flex gap-2">
            <button 
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleConfirm}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors flex items-center gap-1.5"
            >
              <Check size={14} />
              Apply
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#0a0a0a] select-none">
          <div 
            ref={containerRef}
            className="relative inline-block"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img 
              ref={imageRef}
              src={imageSrc} 
              alt="Edit" 
              className="max-w-[80vw] max-h-[70vh] object-contain block pointer-events-none"
              onLoad={() => {
                if (imageRef.current) {
                   const { width, height } = imageRef.current;
                   setSelection({ x: width * 0.1, y: height * 0.1, width: width * 0.8, height: height * 0.8 });
                }
              }}
            />
            
            {selection && (
              <>
                {/* Darken outside area */}
                <div 
                  className="absolute inset-0 bg-black/50 pointer-events-none"
                  style={{
                    clipPath: `polygon(0% 0%, 0% 100%, ${selection.x}px 100%, ${selection.x}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y + selection.height}px, ${selection.x}px ${selection.y + selection.height}px, ${selection.x}px 100%, 100% 100%, 100% 0%)`
                  }}
                />
                
                {/* Selection Box */}
                <div 
                  className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] cursor-move"
                  style={{
                    left: selection.x,
                    top: selection.y,
                    width: selection.width,
                    height: selection.height
                  }}
                >
                  {/* Grid lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-50">
                    <div className="border-r border-white/30" />
                    <div className="border-r border-white/30" />
                    <div className="border-b border-white/30 col-span-3 row-start-1" />
                    <div className="border-b border-white/30 col-span-3 row-start-2" />
                  </div>

                  {/* Handles */}
                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-black rounded-full cursor-nw-resize" />
                  <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-black rounded-full cursor-ne-resize" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-black rounded-full cursor-sw-resize" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-black rounded-full cursor-se-resize" />
                </div>
              </>
            )}
          </div>
        </div>
        
        <div className="p-3 bg-[#1a1a1a] border-t border-zinc-800 text-[10px] text-zinc-500 text-center">
          Drag to move • Drag corners to resize
        </div>
      </div>
    </div>
  );
}

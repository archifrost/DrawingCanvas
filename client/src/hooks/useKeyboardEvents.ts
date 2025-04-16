import { useEffect } from 'react';
import { Tool } from '@/types';

interface UseKeyboardEventsProps {
  activeTool: Tool;
  drawingLine: boolean;
  drawingPolyline: boolean;
  isDraggingEndpoint: boolean;
  cancelDrawing: () => void;
  handleUndo: () => void;
  onToolChange?: (tool: Tool) => void;
  onSelectObject?: (object: any) => void;
  resetEndpointDragging: () => void;
}

/**
 * Klavye olaylarını yöneten custom hook
 * @param props Klavye olayları için gerekli parametreler
 */
export function useKeyboardEvents({
  activeTool,
  drawingLine,
  drawingPolyline,
  isDraggingEndpoint,
  cancelDrawing,
  handleUndo,
  onToolChange,
  onSelectObject,
  resetEndpointDragging
}: UseKeyboardEventsProps) {
  
  useEffect(() => {
    // Klavye olayları için handler
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z / Cmd+Z ile geri alma
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Escape tuşu - çizim modunu iptal et
      if (e.key === 'Escape') {
        // Çizgi veya polyline çizimi iptal etme
        if (drawingLine || drawingPolyline) {
          cancelDrawing();
        }
        
        // Çizgi uç noktası sürükleme işlemini iptal et
        if (isDraggingEndpoint) {
          resetEndpointDragging();
        }
        
        // Selection tool'a geç
        if (activeTool !== 'selection' && onToolChange) {
          onToolChange('selection');
        }
      }
    };
    
    // Event listener'ları ekle
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeTool, 
    drawingLine, 
    drawingPolyline, 
    isDraggingEndpoint, 
    cancelDrawing,
    handleUndo,
    onToolChange,
    onSelectObject,
    resetEndpointDragging
  ]);
  
  // Bu hook bir şey döndürmüyor, sadece yan etkileri (event dinleme) var
}
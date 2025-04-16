import { useCallback, useEffect } from 'react';
import { Tool } from '@/types/index';

interface UseKeyboardEventsProps {
  handleUndo: () => void;
  selectedShapeId: number | null;
  onSelectObject: ((object: any) => void) | undefined;
  activeTool: Tool;
  onToolChange?: (tool: Tool) => void;
  drawingLine: boolean;
  setDrawingLine: (drawing: boolean) => void;
  lineFirstPointRef: React.MutableRefObject<any>;
  currentShapeRef: React.MutableRefObject<any>;
  drawingPolyline: boolean;
  setDrawingPolyline: (drawing: boolean) => void;
  polylinePointsRef: React.MutableRefObject<any[]>;
  isDraggingEndpoint: boolean;
  setIsDraggingEndpoint: (dragging: boolean) => void;
  draggingLineEndpointRef: React.MutableRefObject<any>;
  originalLineRef: React.MutableRefObject<any>;
}

export function useKeyboardEvents({
  handleUndo,
  selectedShapeId,
  onSelectObject,
  activeTool,
  onToolChange,
  drawingLine,
  setDrawingLine,
  lineFirstPointRef,
  currentShapeRef,
  drawingPolyline,
  setDrawingPolyline,
  polylinePointsRef,
  isDraggingEndpoint,
  setIsDraggingEndpoint,
  draggingLineEndpointRef,
  originalLineRef
}: UseKeyboardEventsProps) {
  
  // Keyboard event handler - ESC tuşu ve CTRL+Z için
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // CTRL+Z geri al (Mac için Command+Z)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault(); // Tarayıcının varsayılan geri alma davranışını engelle
      handleUndo();
      return;
    }
    
    // Escape tuşu - işlemi iptal et
    if (e.key === 'Escape') {
      // Seçili şekli temizle
      
      // Üst bileşene bildir
      if (onSelectObject) {
        onSelectObject(null);
      }
      
      // Çizim durumunu sıfırla
      const isDrawing = drawingLine || drawingPolyline || isDraggingEndpoint;
      
      // Çizgi çizme işlemini iptal et
      if (drawingLine) {
        lineFirstPointRef.current = null;
        currentShapeRef.current = null;
        setDrawingLine(false);
      }
      
      // Polyline çizim işlemini iptal et
      if (drawingPolyline) {
        polylinePointsRef.current = [];
        currentShapeRef.current = null;
        setDrawingPolyline(false);
      }
      
      // Çizgi uç noktası sürükleme işlemini iptal et
      if (isDraggingEndpoint) {
        draggingLineEndpointRef.current = null;
        originalLineRef.current = null;
        setIsDraggingEndpoint(false);
      }
      
      // Eğer seçim aracında değilsek seçim aracına geç
      // Çizim yaparken ya da aracımız 'selection' değilse selection aracına geç
      if ((isDrawing || activeTool !== 'selection') && onToolChange) {
        onToolChange('selection');
      }
    }
  }, [
    activeTool, 
    onSelectObject, 
    onToolChange, 
    drawingLine, 
    drawingPolyline, 
    isDraggingEndpoint, 
    handleUndo,
    lineFirstPointRef,
    currentShapeRef,
    setDrawingLine,
    polylinePointsRef,
    setDrawingPolyline,
    draggingLineEndpointRef,
    originalLineRef,
    setIsDraggingEndpoint
  ]);
  
  // Keyboard eventleri için useEffect
  useEffect(() => {
    // Event listener ekle
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]); // Sadece handleKeyDown değiştiğinde bağla
  
  return {
    handleKeyDown
  };
}
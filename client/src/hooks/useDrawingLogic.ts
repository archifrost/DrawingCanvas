import { useRef, useState, useCallback } from 'react';
import { Tool, Point, CanvasState } from '@/types';
import { screenToWorld } from '@/lib/canvasUtils';
import { findNearestSnapPoint } from '@/lib/drawingPrimitives';

interface UseDrawingLogicProps {
  activeTool: Tool;
  canvasState: CanvasState;
  nextIdRef: React.MutableRefObject<number>;
  shapesRef: React.MutableRefObject<any[]>;
  actionsHistoryRef: React.MutableRefObject<any[]>;
  snapEnabled: boolean;
  orthoEnabled: boolean;
}

interface UseDrawingLogicResult {
  // Çizim durumları
  drawingLine: boolean;
  drawingPolyline: boolean;
  
  // Referanslar
  currentShape: any;
  lineFirstPoint: Point | null;
  polylinePoints: Point[];
  
  // Eylemler
  startDrawing: (point: Point) => void;
  continueDrawing: (point: Point) => void;
  finishDrawing: (point: Point) => void;
  cancelDrawing: () => void;
  
  // Yardımcı fonksiyonlar
  applyOrthoConstraint: (startPoint: Point, endPoint: Point) => Point;
  applySnapPoint: (point: Point) => Point;
}

/**
 * Aktif araca göre çizim mantığını yöneten hook
 * @param props Çizim için gerekli props
 * @returns Çizim durumları ve eylemler
 */
export function useDrawingLogic({
  activeTool,
  canvasState,
  nextIdRef,
  shapesRef,
  actionsHistoryRef,
  snapEnabled,
  orthoEnabled
}: UseDrawingLogicProps): UseDrawingLogicResult {
  // Çizim durumu state'leri
  const [drawingLine, setDrawingLine] = useState<boolean>(false);
  const [drawingPolyline, setDrawingPolyline] = useState<boolean>(false);
  
  // Referanslar
  const currentShapeRef = useRef<any>(null);
  const lineFirstPointRef = useRef<Point | null>(null);
  const polylinePointsRef = useRef<Point[]>([]);

  /**
   * Verilen bir noktaya en yakın snap noktasını bulur
   * @param point Kaynak nokta
   * @returns Snap noktası veya orijinal nokta
   */
  const applySnapPoint = useCallback((point: Point): Point => {
    if (!snapEnabled) return point;
    
    const snapTolerance = 10 / canvasState.zoom;
    const snapPoint = findNearestSnapPoint(point, shapesRef.current, snapTolerance);
    
    return snapPoint || point;
  }, [canvasState.zoom, shapesRef, snapEnabled]);

  /**
   * Ortho modunda ikinci noktaya kısıtlama uygular (yatay veya dikey çizgi)
   * @param startPoint Başlangıç noktası
   * @param endPoint Bitiş noktası
   * @returns Ortho kısıtlaması uygulanmış nokta
   */
  const applyOrthoConstraint = useCallback((startPoint: Point, endPoint: Point): Point => {
    if (!orthoEnabled) return endPoint;
    
    // Delta değerlerini hesapla
    const dx = Math.abs(endPoint.x - startPoint.x);
    const dy = Math.abs(endPoint.y - startPoint.y);
    
    // Yatay veya dikey çizim
    if (dx > dy) {
      // Yatay çizgi (y değerini sabit tut)
      return {
        x: endPoint.x,
        y: startPoint.y
      };
    } else {
      // Dikey çizgi (x değerini sabit tut)
      return {
        x: startPoint.x,
        y: endPoint.y
      };
    }
  }, [orthoEnabled]);

  /**
   * Çizim işlemini başlatır
   * @param point Başlangıç noktası
   */
  const startDrawing = useCallback((point: Point) => {
    const snapPoint = applySnapPoint(point);
    
    if (activeTool === 'line') {
      // İlk noktayı kaydet
      lineFirstPointRef.current = snapPoint;
      
      // Geçici çizgi oluştur
      currentShapeRef.current = {
        id: nextIdRef.current,
        type: 'line',
        startX: snapPoint.x,
        startY: snapPoint.y,
        endX: snapPoint.x,
        endY: snapPoint.y,
        thickness: 1,
        isPreview: true
      };
      
      setDrawingLine(true);
    } 
    else if (activeTool === 'polyline') {
      // İlk nokta
      if (polylinePointsRef.current.length === 0) {
        polylinePointsRef.current.push(snapPoint);
        
        // Geçici polyline oluştur
        currentShapeRef.current = {
          id: nextIdRef.current,
          type: 'polyline',
          points: [snapPoint],
          thickness: 1,
          closed: false,
          isPreview: true
        };
        
        setDrawingPolyline(true);
      } 
      // Daha sonraki noktalar
      else {
        // Son noktayı al
        const lastPoint = polylinePointsRef.current[polylinePointsRef.current.length - 1];
        
        // Ortho kısıtlaması uygula
        const constrainedPoint = orthoEnabled ? applyOrthoConstraint(lastPoint, snapPoint) : snapPoint;
        
        // Nokta ekle
        polylinePointsRef.current.push(constrainedPoint);
        
        // Geçici polyline'ı güncelle
        if (currentShapeRef.current) {
          currentShapeRef.current = {
            ...currentShapeRef.current,
            points: [...polylinePointsRef.current]
          };
        }
      }
    }
    else if (activeTool === 'point') {
      // Nokta oluştur
      const newPoint = {
        id: nextIdRef.current++,
        type: 'point',
        x: snapPoint.x,
        y: snapPoint.y,
        style: 'default'
      };
      
      // İşlem tarihçesine ekle
      actionsHistoryRef.current.push({
        action: 'add_shape',
        data: { shapeId: newPoint.id }
      });
      
      // Şekil listesine ekle
      shapesRef.current.push(newPoint);
    }
  }, [activeTool, applySnapPoint, applyOrthoConstraint, nextIdRef, shapesRef, actionsHistoryRef, orthoEnabled]);

  /**
   * Devam eden çizim işlemini günceller
   * @param point Güncel nokta
   */
  const continueDrawing = useCallback((point: Point) => {
    const snapPoint = applySnapPoint(point);
    
    if (activeTool === 'line' && drawingLine && lineFirstPointRef.current) {
      // Ortho kısıtlaması uygula
      const constrainedPoint = orthoEnabled ? 
        applyOrthoConstraint(lineFirstPointRef.current, snapPoint) : 
        snapPoint;
      
      // Çizgiyi güncelle
      if (currentShapeRef.current) {
        currentShapeRef.current = {
          ...currentShapeRef.current,
          startX: lineFirstPointRef.current.x,
          startY: lineFirstPointRef.current.y,
          endX: constrainedPoint.x,
          endY: constrainedPoint.y,
          isSnapping: snapPoint !== point,
          isDashed: true
        };
      }
    } 
    else if (activeTool === 'polyline' && drawingPolyline && polylinePointsRef.current.length > 0) {
      // Son noktayı al
      const lastPoint = polylinePointsRef.current[polylinePointsRef.current.length - 1];
      
      // Ortho kısıtlaması uygula
      const constrainedPoint = orthoEnabled ? 
        applyOrthoConstraint(lastPoint, snapPoint) : 
        snapPoint;
      
      // Geçici polyline'ı güncelle - son notaya fareyi ekleyerek
      if (currentShapeRef.current) {
        const points = [...polylinePointsRef.current];
        const allPoints = [...points, constrainedPoint];
        
        currentShapeRef.current = {
          ...currentShapeRef.current,
          points: allPoints,
          isSnapping: snapPoint !== point
        };
      }
    }
  }, [activeTool, drawingLine, drawingPolyline, applySnapPoint, applyOrthoConstraint, orthoEnabled]);

  /**
   * Çizim işlemini tamamlar
   * @param point Son nokta
   */
  const finishDrawing = useCallback((point: Point) => {
    const snapPoint = applySnapPoint(point);
    
    if (activeTool === 'line' && drawingLine && lineFirstPointRef.current) {
      // Ortho kısıtlaması uygula
      const constrainedPoint = orthoEnabled ? 
        applyOrthoConstraint(lineFirstPointRef.current, snapPoint) : 
        snapPoint;
      
      // Son çizgiyi oluştur
      const newLine = {
        id: nextIdRef.current++,
        type: 'line',
        startX: lineFirstPointRef.current.x,
        startY: lineFirstPointRef.current.y,
        endX: constrainedPoint.x,
        endY: constrainedPoint.y,
        thickness: 1
      };
      
      // İşlem tarihçesine ekle
      actionsHistoryRef.current.push({
        action: 'add_shape',
        data: { shapeId: newLine.id }
      });
      
      // Şekil listesine ekle
      shapesRef.current.push(newLine);
      
      // Çizim durumunu temizle
      lineFirstPointRef.current = null;
      currentShapeRef.current = null;
      setDrawingLine(false);
    } 
    else if (activeTool === 'polyline' && drawingPolyline && polylinePointsRef.current.length >= 2) {
      // Son polyline'ı oluştur
      const newPolyline = {
        id: nextIdRef.current++,
        type: 'polyline',
        points: [...polylinePointsRef.current],
        thickness: 1,
        closed: false
      };
      
      // İşlem tarihçesine ekle
      actionsHistoryRef.current.push({
        action: 'add_shape',
        data: { shapeId: newPolyline.id }
      });
      
      // Şekil listesine ekle
      shapesRef.current.push(newPolyline);
      
      // Çizim durumunu temizle
      polylinePointsRef.current = [];
      currentShapeRef.current = null;
      setDrawingPolyline(false);
    }
  }, [activeTool, drawingLine, drawingPolyline, applySnapPoint, applyOrthoConstraint, nextIdRef, shapesRef, actionsHistoryRef, orthoEnabled]);

  /**
   * Çizim işlemini iptal eder
   */
  const cancelDrawing = useCallback(() => {
    if (drawingLine) {
      lineFirstPointRef.current = null;
      currentShapeRef.current = null;
      setDrawingLine(false);
    }
    
    if (drawingPolyline) {
      polylinePointsRef.current = [];
      currentShapeRef.current = null;
      setDrawingPolyline(false);
    }
  }, [drawingLine, drawingPolyline]);

  // Aktif araç değiştiğinde çizim durumunu sıfırla
  // useEffect(() => {
  //   cancelDrawing();
  // }, [activeTool, cancelDrawing]);

  return {
    // Çizim durumları
    drawingLine,
    drawingPolyline,
    
    // Referanslar
    currentShape: currentShapeRef.current,
    lineFirstPoint: lineFirstPointRef.current,
    polylinePoints: polylinePointsRef.current,
    
    // Eylemler
    startDrawing,
    continueDrawing,
    finishDrawing,
    cancelDrawing,
    
    // Yardımcı fonksiyonlar
    applyOrthoConstraint,
    applySnapPoint
  };
}
import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasState, Point, Tool } from '@/types';
import { screenToWorld, worldToScreen, findNearestSnapPoint } from '@/lib/canvasUtils';
import { distance, pointNearLine, pointNearPolyline, getLineEndpoint, getPolylineVertexAtPoint } from '@/lib/drawingPrimitives';

interface UseCanvasEventsProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  shapesRef: React.MutableRefObject<any[]>;
  actionsHistoryRef: React.MutableRefObject<any[]>;
  canvasState: CanvasState;
  activeTool: Tool;
  snapEnabled: boolean;
  orthoEnabled: boolean;
  selectedShapeId: number | null;
  nextIdRef: React.MutableRefObject<number>;
  onMousePositionChange: (position: Point) => void;
  onPanChange: (x: number, y: number) => void;
  onZoomChange: (zoom: number) => void;
  onSelectObject?: (object: any) => void;
  onToolChange?: (tool: Tool) => void;
}

interface UseCanvasEventsReturn {
  drawingLine: boolean;
  drawingPolyline: boolean;
  isDraggingEndpoint: boolean;
  isPanning: boolean;
  currentShape: any;
  lineFirstPoint: Point | null;
  polylinePoints: Point[];
  draggingLineEndpoint: 'start' | 'end' | 'vertex' | null;
  originalLine: any;
  middleMouseDown: boolean;
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleUndo: () => void;
  resetDrawingStates: () => void;
}

export function useCanvasEvents({
  canvasRef,
  containerRef,
  shapesRef,
  actionsHistoryRef,
  canvasState,
  activeTool,
  snapEnabled,
  orthoEnabled,
  selectedShapeId,
  nextIdRef,
  onMousePositionChange,
  onPanChange,
  onZoomChange,
  onSelectObject,
  onToolChange
}: UseCanvasEventsProps): UseCanvasEventsReturn {
  // State
  const [drawingLine, setDrawingLine] = useState<boolean>(false);
  const [drawingPolyline, setDrawingPolyline] = useState<boolean>(false);
  const [isDraggingEndpoint, setIsDraggingEndpoint] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [middleMouseDown, setMiddleMouseDown] = useState<boolean>(false);

  // Refs
  const lineFirstPointRef = useRef<Point | null>(null);
  const polylinePointsRef = useRef<Point[]>([]);
  const currentShapeRef = useRef<any>(null);
  const draggingLineEndpointRef = useRef<'start' | 'end' | 'vertex' | null>(null);
  const originalLineRef = useRef<any>(null);
  const lastMousePosRef = useRef<Point>({ x: 0, y: 0 });

  // Geri alma (undo) işlemi
  const handleUndo = useCallback(() => {
    // İşlem geçmişinde bir şey var mı kontrol et
    if (actionsHistoryRef.current.length === 0) {
      console.log("Geri alınacak işlem yok");
      return;
    }

    // Son işlemi al
    const lastAction = actionsHistoryRef.current.pop();
    
    if (!lastAction) return;
    
    console.log("İşlem geri alınıyor:", lastAction.action);

    switch (lastAction.action) {
      case 'add_shape':
        // Son eklenen şekli kaldır
        if (lastAction.data && lastAction.data.shapeId) {
          const shapeIndex = shapesRef.current.findIndex(s => s.id === lastAction.data.shapeId);
          
          if (shapeIndex !== -1) {
            // Şekli kaldır
            shapesRef.current.splice(shapeIndex, 1);
            
            // Eğer silinen şekil seçiliyse, seçimi kaldır
            if (selectedShapeId === lastAction.data.shapeId) {
              if (onSelectObject) onSelectObject(null);
            }
          }
        }
        break;
        
      case 'update_shape':
        // Değiştirilen şekli önceki duruma getir
        if (lastAction.data && lastAction.data.originalShape) {
          const shapeIndex = shapesRef.current.findIndex(s => s.id === lastAction.data.originalShape.id);
          
          if (shapeIndex !== -1) {
            // Şekli eski haline döndür
            shapesRef.current[shapeIndex] = lastAction.data.originalShape;
            
            // Eğer güncellenen şekil seçiliyse, güncellenmiş bilgileri göster
            if (selectedShapeId === lastAction.data.originalShape.id && onSelectObject) {
              onSelectObject(lastAction.data.originalShape);
            }
          }
        }
        break;
        
      case 'delete_shape':
        // Silinen şekli geri ekle
        if (lastAction.data && lastAction.data.deletedShape) {
          shapesRef.current.push(lastAction.data.deletedShape);
        }
        break;
        
      case 'clear_shapes':
        // Temizlenen tüm şekilleri geri getir
        if (lastAction.data && lastAction.data.oldShapes) {
          shapesRef.current = [...lastAction.data.oldShapes];
        }
        break;
        
      case 'batch_add_shapes':
        // Toplu eklenen şekilleri geri al
        if (lastAction.data && Array.isArray(lastAction.data.shapeIds)) {
          // Silme işlemini her ID için yapalım
          for (const shapeId of lastAction.data.shapeIds) {
            const shapeIndex = shapesRef.current.findIndex(s => s.id === shapeId);
            if (shapeIndex !== -1) {
              // Şekli kaldır
              shapesRef.current.splice(shapeIndex, 1);
              
              // Eğer silinen şekil seçiliyse, seçimi kaldır
              if (selectedShapeId === shapeId) {
                if (onSelectObject) onSelectObject(null);
              }
            }
          }
          // Hepsi birlikte tek bir işlem olarak geri alındı, konsola log yazalım
          console.log("Toplu şekil ekleme işlemi geri alındı, silinen şekil sayısı:", lastAction.data.shapeIds.length);
        }
        break;
        
      default:
        console.log("Bilinmeyen işlem tipi:", lastAction.action);
    }
    
    console.log("İşlem geri alındı. Kalan işlem sayısı:", actionsHistoryRef.current.length);
    
  }, [selectedShapeId, onSelectObject, actionsHistoryRef, shapesRef]);

  // Çizim durumlarını sıfırlayan yardımcı fonksiyon
  const resetDrawingStates = useCallback(() => {
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
  }, [drawingLine, drawingPolyline, isDraggingEndpoint]);

  // Şekil bulma yardımcı fonksiyonu
  const findShapeAtPoint = useCallback((point: Point): any | null => {
    // Zoom seviyesine göre seçim toleransını hesapla
    const baseTolerance = 20; // Baz tolerans değeri
    const zoomAdjustedTolerance = baseTolerance / canvasState.zoom;
    
    // En düşük ve en yüksek tolerans sınırları
    const minTolerance = 5;
    const maxTolerance = 25;
    
    // Toleransı sınırlar içinde tut
    const tolerance = Math.min(Math.max(zoomAdjustedTolerance, minTolerance), maxTolerance);
    
    // Eğer zaten bir şekil seçiliyse, özel durumları kontrol et
    if (selectedShapeId !== null && activeTool === 'selection') {
      const selectedShape = shapesRef.current.find(s => s.id === selectedShapeId);
      
      // Çizgi seçiliyse uç noktalarına tıklandığını kontrol et
      if (selectedShape && selectedShape.type === 'line') {
        // Eğer çizginin uç noktalarından birine tıklandıysa
        const endpoint = getLineEndpoint(selectedShape, point, tolerance * 1.5); // Biraz daha geniş tolerans
        
        if (endpoint) {
          // Uç noktası sürükleme modu için çizgiyi ve hangi ucunu seçtiğimizi kaydet
          draggingLineEndpointRef.current = endpoint;
          originalLineRef.current = { ...selectedShape };
          setIsDraggingEndpoint(true);
          
          // Aynı çizgiyi döndür - zaten seçiliydi
          return selectedShape;
        }
      } 
      // Polyline seçiliyse noktalarına tıklandığını kontrol et
      else if (selectedShape && selectedShape.type === 'polyline') {
        // Polyline noktalarından birine tıklandı mı?
        const vertexIndex = getPolylineVertexAtPoint(selectedShape, point, tolerance * 1.5);
        
        if (vertexIndex !== null) {
          // Polyline vertex düzenleme modu
          draggingLineEndpointRef.current = 'vertex';  // İmleç durumunu değiştirmek için
          originalLineRef.current = { 
            ...selectedShape,
            vertexIndex: vertexIndex // Düzenlenen vertex'in indeksini sakla
          };
          setIsDraggingEndpoint(true);
          
          // Aynı polyline'ı döndür - zaten seçiliydi
          return selectedShape;
        }
      }
    }
    
    // Normal şekil arama devam ediyor
    // Check shapes in reverse order (last drawn on top)
    const shapes = shapesRef.current;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const shape = shapes[i];
      
      switch (shape.type) {
        case 'point':
          // For a point, check if the click is within a small radius
          if (distance(point, { x: shape.x, y: shape.y }) <= tolerance) {
            return shape;
          }
          break;
          
        case 'line':
          // For a line, check if the click is near the line
          if (pointNearLine(point, shape, tolerance)) {
            return shape;
          }
          break;
          
        case 'polyline':
          // For a polyline, check if the click is near any segment
          if (pointNearPolyline(point, shape, tolerance)) {
            return shape;
          }
          break;
          
        case 'text':
          // For text, simplified check using a rectangular area
          // Would need more sophisticated checking for actual text bounds
          // Create a bounding box for the text
          const textBounds = {
            x: shape.x,
            y: shape.y - shape.fontSize, // Adjust Y to account for text height
            width: shape.text.length * (shape.fontSize * 0.6), // Estimate width based on fontSize
            height: shape.fontSize * 1.2 // Add some extra height
          };
          
          // Check if point is inside text bounds
          if (point.x >= textBounds.x && point.x <= textBounds.x + textBounds.width &&
              point.y >= textBounds.y && point.y <= textBounds.y + textBounds.height) {
            return shape;
          }
          break;
      }
    }
    
    // No shape found at this point
    return null;
  }, [selectedShapeId, activeTool, canvasState.zoom, shapesRef]);

  // Mouse move olayı
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate world position (zoomed and panned coordinates)
    const worldPos = screenToWorld(mouseX, mouseY, canvasState);
    
    // Update mouse position for UI
    onMousePositionChange(worldPos);
    
    // Store last mouse position for panning
    lastMousePosRef.current = { x: mouseX, y: mouseY };
    
    // Handle panning (middle mouse button)
    if (middleMouseDown || (activeTool === 'selection' && e.buttons === 1 && !selectedShapeId && !isDraggingEndpoint)) {
      // Calculate delta
      const dx = e.movementX;
      const dy = e.movementY;
      
      // Update pan offset
      onPanChange(
        canvasState.panOffset.x + dx,
        canvasState.panOffset.y + dy
      );
      
      // Eğer hareket ediyorsak, fareyi grab stiline çeviriyoruz
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing';
      }
      
      return; // Panning sırasında diğer işlemleri yapmıyoruz
    }
    
    // Handle shape dragging (selection tool + selected shape)
    if (activeTool === 'selection' && e.buttons === 1 && selectedShapeId && !isDraggingEndpoint) {
      const shapeIndex = shapesRef.current.findIndex(s => s.id === selectedShapeId);
      
      if (shapeIndex !== -1) {
        const shape = shapesRef.current[shapeIndex];
        
        // Move according to world delta
        const deltaX = e.movementX / canvasState.zoom;
        const deltaY = e.movementY / canvasState.zoom;
        
        // Perform specific update based on shape type
        if (shape.type === 'point') {
          shape.x += deltaX;
          shape.y += deltaY;
        } else if (shape.type === 'line') {
          shape.startX += deltaX;
          shape.startY += deltaY;
          shape.endX += deltaX;
          shape.endY += deltaY;
        } else if (shape.type === 'polyline' && Array.isArray(shape.points)) {
          // Move all points
          shape.points = shape.points.map((p: Point) => ({
            x: p.x + deltaX,
            y: p.y + deltaY
          }));
        } else if (shape.type === 'text') {
          shape.x += deltaX;
          shape.y += deltaY;
        }
        
        // Update UI
        if (onSelectObject) {
          onSelectObject(shape);
        }
        
        return; // Early return when dragging
      }
    }
    
    // Handle endpoint dragging (selection tool + selected endpoint of a shape)
    if (isDraggingEndpoint && e.buttons === 1) {
      const shapeIndex = shapesRef.current.findIndex(s => s.id === selectedShapeId);
      
      if (shapeIndex !== -1) {
        const shape = shapesRef.current[shapeIndex];
        
        // Snap (yakalama) noktası kontrolü - en yakın yakalama noktasını bul
        const snapTolerance = 10 / canvasState.zoom; // Zoom'a göre ayarlanmış tolerans
        
        // Snap özelliği kapalıysa null, açıksa en yakın snap noktasını kullan
        const snapPoint = snapEnabled
          ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance)
          : null;
          
        // Eğer yakalama noktası varsa onu kullan, yoksa normal fare pozisyonunu kullan
        const endPoint = snapPoint || worldPos;
        
        if (shape.type === 'line') {
          // Çizgi uç noktası taşıma
          // Hangi uç noktasının taşındığına göre güncelle
          if (draggingLineEndpointRef.current === 'start') {
            shape.startX = endPoint.x;
            shape.startY = endPoint.y;
          } else if (draggingLineEndpointRef.current === 'end') {
            shape.endX = endPoint.x;
            shape.endY = endPoint.y;
          }
        } 
        else if (shape.type === 'polyline' && draggingLineEndpointRef.current === 'vertex') {
          // Polyline noktası taşıma
          const vertexIndex = originalLineRef.current?.vertexIndex;
          if (vertexIndex !== undefined && Array.isArray(shape.points) && vertexIndex < shape.points.length) {
            // Belirli bir vertex'i güncelle
            shape.points[vertexIndex] = { x: endPoint.x, y: endPoint.y };
          }
        }
        
        // UI güncellemesi için seçili nesneyi güncelle
        if (onSelectObject) {
          onSelectObject(shape);
        }
        
        // Canvas'ın yeniden çizilmesini sağlayan düzenleme
        shapesRef.current[shapeIndex] = { ...shape };
        
        // İmleç stilini güncelle
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'move';
        }
      }
    } 
    
    // Handle shape drawing (sol fare tuşu çizim)
    else if (currentShapeRef.current && activeTool !== 'selection') {
      // Çizgi çizme özel durumu
      if (activeTool === 'line' && drawingLine) {
        // Birinci nokta sabit, ikinci nokta fare ile hareket eder
        if (lineFirstPointRef.current) {
          // Snap (yakalama) noktası kontrolü - en yakın yakalama noktasını bul
          const snapTolerance = 10 / canvasState.zoom; // Zoom'a göre ayarlanmış tolerans
          // Snap özelliği kapalıysa null, açıksa en yakın snap noktasını kullan
          const snapPoint = snapEnabled
            ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance)
            : null;
          
          // Eğer yakalama noktası varsa onu kullan, yoksa normal fare pozisyonunu kullan
          let endPoint = snapPoint || worldPos;
          
          // Ortho modu açıksa, çizgiyi yatay veya dikey olarak zorla
          if (orthoEnabled && !snapPoint) { // Snap noktası varsa, snap'e öncelik ver
            // İlk nokta ile fare pozisyonu arasındaki delta değerlerini hesapla
            const dx = Math.abs(endPoint.x - lineFirstPointRef.current.x);
            const dy = Math.abs(endPoint.y - lineFirstPointRef.current.y);
            
            // Hangisi daha büyük - yatay veya dikey çizim
            if (dx > dy) {
              // Yatay çizgi (y değerini sabit tut)
              endPoint = {
                x: endPoint.x,
                y: lineFirstPointRef.current.y
              };
            } else {
              // Dikey çizgi (x değerini sabit tut)
              endPoint = {
                x: lineFirstPointRef.current.x, 
                y: endPoint.y
              };
            }
          }
          
          currentShapeRef.current = {
            ...currentShapeRef.current,
            startX: lineFirstPointRef.current.x,
            startY: lineFirstPointRef.current.y,
            endX: endPoint.x,
            endY: endPoint.y,
            // Yakalama noktası varsa bunu görsel olarak belirt
            isSnapping: !!snapPoint,
            isDashed: true // Kesikli çizgi olarak göster
          };
        }
      } 
      // Polyline çizme özel durumu
      else if (activeTool === 'polyline' && drawingPolyline) {
        if (polylinePointsRef.current.length > 0) {
          // Geçici polyline oluştur - şu ana kadar eklenen noktaları içerir
          const tempPolyline = {
            id: -999, // Geçici ID
            type: 'polyline',
            points: [...polylinePointsRef.current],
            thickness: 1,
            closed: false
          };
          
          // Snap yakalama kontrolü
          const snapTolerance = 10 / canvasState.zoom;
          const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
          
          // Fareyi ya da snap noktasını ekle (snap noktası varsa onu kullan)
          tempPolyline.points.push(snapPoint || worldPos);
          
          // Ortho modu polyline için biraz farklı çalışır - son segmenti düzleştir
          if (orthoEnabled && polylinePointsRef.current.length > 0 && !snapPoint) {
            const lastPoint = polylinePointsRef.current[polylinePointsRef.current.length - 1];
            const mousePos = worldPos;
            
            // Son nokta ile fare arasındaki delta
            const dx = Math.abs(mousePos.x - lastPoint.x);
            const dy = Math.abs(mousePos.y - lastPoint.y);
            
            let orthoPoint;
            if (dx > dy) {
              // Yatay çizgi
              orthoPoint = { x: mousePos.x, y: lastPoint.y };
            } else {
              // Dikey çizgi
              orthoPoint = { x: lastPoint.x, y: mousePos.y };
            }
            
            // Son noktayı "ortho" noktası ile değiştir
            tempPolyline.points[tempPolyline.points.length - 1] = orthoPoint;
          }
          
          // Geçici polyline'ı güncelle
          currentShapeRef.current = tempPolyline;
        }
      }
    }
  }, [
    activeTool, 
    canvasState, 
    middleMouseDown, 
    selectedShapeId, 
    isDraggingEndpoint,
    snapEnabled,
    orthoEnabled,
    drawingLine,
    drawingPolyline,
    onMousePositionChange,
    onPanChange,
    onSelectObject,
    findShapeAtPoint
  ]);
  
  // Mouse down olayı
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate world position (zoomed and panned coordinates)
    const worldPos = screenToWorld(mouseX, mouseY, canvasState);
    
    // Middle mouse button'a basıldığında panning modunu aç
    if (e.button === 1) {
      setMiddleMouseDown(true);
      if (canvasRef.current) {
        // Grab (sürükleme) cursor'ünü uygula
        canvasRef.current.style.cursor = 'grabbing';
      }
      return;
    }
    
    // Ortho modu aktifse (shift tuşu da alternatif olabilir)
    const isOrthoActive = orthoEnabled || e.shiftKey;
    
    // Selection tool ile tıklama
    if (activeTool === 'selection' && e.button === 0) {
      // Find shape at mouse position
      const selectedShape = findShapeAtPoint(worldPos);
      
      // Bir şekil seçildiyse, onu kaydet
      if (selectedShape) {
        if (onSelectObject) {
          onSelectObject(selectedShape);
        }
      } else {
        // Hiçbir şeye tıklanmadıysa seçimi temizle
        if (onSelectObject) {
          onSelectObject(null);
        }
      }
    }
    // Drawing tools
    else if (e.button === 0) {
      // Line tool
      if (activeTool === 'line') {
        // Eğer ilk nokta henüz yoksa, ilk noktayı ekle
        if (!lineFirstPointRef.current) {
          // Snap noktası kontrolü
          const snapTolerance = 10 / canvasState.zoom;
          const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
          
          // İlk nokta olarak ya snapPoint'i ya da fare pozisyonunu kullan
          lineFirstPointRef.current = snapPoint || worldPos;
          
          // Geçici çizgi oluştur - henüz shapesRef'e eklemiyoruz
          currentShapeRef.current = {
            id: nextIdRef.current,
            type: 'line',
            startX: lineFirstPointRef.current.x,
            startY: lineFirstPointRef.current.y,
            endX: lineFirstPointRef.current.x,
            endY: lineFirstPointRef.current.y,
            thickness: 1,
            isPreview: true
          };
          
          // Çizim modunu aç
          setDrawingLine(true);
        } 
        // İkinci tıklama - çizgiyi tamamla
        else {
          // Snap noktası kontrolü
          const snapTolerance = 10 / canvasState.zoom;
          const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
          
          // İkinci nokta olarak ya snapPoint'i ya da fare pozisyonunu kullan
          let secondPoint = snapPoint || worldPos;
          
          // Ortho modu aktifse, çizgiyi yatay veya dikey zorla
          if (isOrthoActive && !snapPoint) { // Snap noktası varsa, ortho'yu geçersiz kıl
            const firstPoint = lineFirstPointRef.current;
            
            // Delta değerlerini hesapla
            const dx = Math.abs(secondPoint.x - firstPoint.x);
            const dy = Math.abs(secondPoint.y - firstPoint.y);
            
            // Hangisi daha büyük - yatay veya dikey çizim
            if (dx > dy) {
              // Yatay çizgi (y değerini sabit tut)
              secondPoint = {
                x: secondPoint.x,
                y: firstPoint.y
              };
            } else {
              // Dikey çizgi (x değerini sabit tut)
              secondPoint = {
                x: firstPoint.x, 
                y: secondPoint.y
              };
            }
          }
          
          // Çizgiyi oluştur
          const newLine = {
            id: nextIdRef.current++,
            type: 'line',
            startX: lineFirstPointRef.current.x,
            startY: lineFirstPointRef.current.y,
            endX: secondPoint.x,
            endY: secondPoint.y,
            thickness: 1,
            isPreview: false
          };
          
          // İşlem tarihçesine ekle
          actionsHistoryRef.current.push({
            action: 'add_shape',
            data: { shapeId: newLine.id }
          });
          
          // Çizgiyi ekle
          shapesRef.current.push(newLine);
          
          // Temizle ve ikinci çizgiye hazırlan
          lineFirstPointRef.current = null;
          currentShapeRef.current = null;
          setDrawingLine(false);
        }
      }
      // Polyline tool
      else if (activeTool === 'polyline') {
        // Snap noktası kontrolü
        const snapTolerance = 10 / canvasState.zoom;
        const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
        
        // Tıklanan nokta olarak ya snapPoint'i ya da fare pozisyonunu kullan
        let clickPoint = snapPoint || worldPos;
        
        // Ortho modu polyline için biraz farklı çalışır
        if (isOrthoActive && polylinePointsRef.current.length > 0 && !snapPoint) {
          const lastPoint = polylinePointsRef.current[polylinePointsRef.current.length - 1];
          
          // Son nokta ile fare arasındaki delta
          const dx = Math.abs(clickPoint.x - lastPoint.x);
          const dy = Math.abs(clickPoint.y - lastPoint.y);
          
          if (dx > dy) {
            // Yatay çizgi
            clickPoint = { x: clickPoint.x, y: lastPoint.y };
          } else {
            // Dikey çizgi
            clickPoint = { x: lastPoint.x, y: clickPoint.y };
          }
        }
        
        // Polyline noktası ekle
        polylinePointsRef.current.push(clickPoint);
        
        // Çizim modunu başlat (ilk nokta için)
        if (!drawingPolyline) {
          setDrawingPolyline(true);
          
          // Geçici polyline oluştur (şimdilik sadece bir nokta var)
          currentShapeRef.current = {
            id: nextIdRef.current,
            type: 'polyline',
            points: [...polylinePointsRef.current],
            thickness: 1,
            closed: false,
            isPreview: true
          };
        }
        // Geçici polyline'ı güncelle
        else {
          currentShapeRef.current = {
            ...currentShapeRef.current,
            points: [...polylinePointsRef.current]
          };
        }
      }
      // Text tool
      else if (activeTool === 'text') {
        // Basit örnek: Metin girişi al ve ekle
        const textContent = prompt("Metin Ekle:", "");
        
        if (textContent) {
          const newText = {
            id: nextIdRef.current++,
            type: 'text',
            x: worldPos.x,
            y: worldPos.y,
            text: textContent,
            fontSize: 16  // Default font size
          };
          
          // İşlem tarihçesine ekle
          actionsHistoryRef.current.push({
            action: 'add_shape',
            data: { shapeId: newText.id }
          });
          
          // Metni ekle
          shapesRef.current.push(newText);
        }
      }
      // Point tool
      else if (activeTool === 'point') {
        // Snap noktası kontrolü
        const snapTolerance = 10 / canvasState.zoom;
        const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
        
        // Tıklanan nokta olarak ya snapPoint'i ya da fare pozisyonunu kullan
        const clickPoint = snapPoint || worldPos;
        
        // Yeni nokta oluştur
        const newPoint = {
          id: nextIdRef.current++,
          type: 'point',
          x: clickPoint.x,
          y: clickPoint.y,
          style: 'default'  // default, square, cross
        };
        
        // İşlem tarihçesine ekle
        actionsHistoryRef.current.push({
          action: 'add_shape',
          data: { shapeId: newPoint.id }
        });
        
        // Noktayı ekle
        shapesRef.current.push(newPoint);
      }
    }
  }, [
    activeTool, 
    canvasState, 
    drawingLine, 
    drawingPolyline, 
    snapEnabled,
    orthoEnabled,
    onSelectObject,
    findShapeAtPoint
  ]);
  
  // Mouse up olayı
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Middle mouse button release
    if (e.button === 1 || middleMouseDown) {
      setMiddleMouseDown(false);
      if (canvasRef.current) {
        // Reset cursor to default
        if (activeTool === 'selection') {
          canvasRef.current.style.cursor = 'grab';
        } else {
          canvasRef.current.style.cursor = 'crosshair';
        }
      }
    }
    
    // Endpoint dragging bittiğinde işlem tarihçesine ekle
    if (isDraggingEndpoint && selectedShapeId) {
      const shapeIndex = shapesRef.current.findIndex(s => s.id === selectedShapeId);
      if (shapeIndex !== -1 && originalLineRef.current) {
        // Değişiklik öncesi durumu işlem tarihçesine ekle
        actionsHistoryRef.current.push({
          action: 'update_shape',
          data: { originalShape: originalLineRef.current }
        });
        
        // Sürükleme durumunu temizle
        setIsDraggingEndpoint(false);
        draggingLineEndpointRef.current = null;
        originalLineRef.current = null;
      }
    }
    
    // Reset cursor
    if (canvasRef.current) {
      if (activeTool === 'selection') {
        canvasRef.current.style.cursor = 'grab';
      } else {
        canvasRef.current.style.cursor = 'crosshair';
      }
    }
    
    // Polyline aracı için currentShapeRef'i koruyoruz, çünkü şekil mouseDown'da shapesRef'e ekleniyor
    // mouseUp'ta sadece sürükleme durumunu sıfırlıyoruz
    if (activeTool === 'polyline' && drawingPolyline) {
      return; // Polyline aracı için MouseUp işlemini kapat
    }
    
    // Çizgi aracı için handleMouseUp'ta bir şey yapmayalım - tüm işlem mouseDown'da gerçekleşiyor
    if (activeTool === 'line') {
      return; // Çizgi aracı için MouseUp işlemini kapat
    }
    
    // Diğer araçlar için şekli ekle
    if (currentShapeRef.current && activeTool !== 'selection') {
      shapesRef.current.push(currentShapeRef.current);
      currentShapeRef.current = null;
    }
  }, [activeTool, middleMouseDown, isDraggingEndpoint, selectedShapeId, drawingPolyline]);

  // Mouse wheel olayı
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    // Get mouse position
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate world coordinates of the mouse position
    const worldPos = screenToWorld(mouseX, mouseY, canvasState);
    
    // Calculate new zoom level
    const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1; // Reduce zoom on scroll down, increase on scroll up
    const newZoom = canvasState.zoom * zoomDelta;
    
    // Limit zoom range
    if (newZoom > 0.000001 && newZoom < 100) {
      // Update zoom first
      onZoomChange(newZoom);
      
      // Calculate the screen position after the zoom change
      const screenPos = worldToScreen(worldPos.x, worldPos.y, {
        ...canvasState,
        zoom: newZoom
      });
      
      // Calculate the difference between where the point is now drawn and where the mouse is
      const dx = screenPos.x - mouseX;
      const dy = screenPos.y - mouseY;
      
      // Adjust the pan offset to compensate for this difference
      onPanChange(
        canvasState.panOffset.x - dx,
        canvasState.panOffset.y - dy
      );
    }
  }, [canvasState, onZoomChange, onPanChange]);

  // Sağ tıklama işlemleri
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Sağ tık menüsünü engelle
    
    // Line aracı aktifken ve ilk nokta seçilmişse
    if (activeTool === 'line' && drawingLine && lineFirstPointRef.current) {
      // Çizim modunu kapat ve referansları temizle (ama line aracından çıkma)
      lineFirstPointRef.current = null;
      currentShapeRef.current = null;
      setDrawingLine(false);
      console.log("Çizgi çizimi iptal edildi, line aracı hala aktif");
    }
    // Polyline çizimi sırasında sağ tıklama ile polyline'ı tamamla
    else if (activeTool === 'polyline' && drawingPolyline && polylinePointsRef.current.length >= 2) {
      // Polyline'ı oluştur
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
      
      // Şekli ekle
      shapesRef.current.push(newPolyline);
      
      // Temizle
      polylinePointsRef.current = [];
      currentShapeRef.current = null;
      setDrawingPolyline(false);
    }
    
    return false; // Event'i engelle
  }, [activeTool, drawingLine, drawingPolyline]);

  // Çift tıklama ile polyline'ı tamamlamak için
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'polyline' && drawingPolyline && polylinePointsRef.current.length >= 2) {
      // Son tıklama noktasını eklemeye gerek yok, zaten ekledik

      // Polyline'ı oluştur
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
      
      // Şekli ekle
      shapesRef.current.push(newPolyline);
      
      // Temizle
      polylinePointsRef.current = [];
      currentShapeRef.current = null;
      setDrawingPolyline(false);
    }
  }, [activeTool, drawingPolyline]);

  // Keyboard eventleri için event listener
  useEffect(() => {
    // Klavye EventListener için handler
    const handleKeyDown = (e: KeyboardEvent) => {
      // CTRL+Z geri al (Mac için Command+Z)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault(); // Tarayıcının varsayılan geri alma davranışını engelle
        handleUndo();
        return;
      }
      
      // Escape tuşu - işlemi iptal et
      if (e.key === 'Escape') {
        // Çizim durumunu sıfırla
        const isDrawing = drawingLine || drawingPolyline || isDraggingEndpoint;
        
        resetDrawingStates();
        
        // Eğer seçim aracında değilsek seçim aracına geç
        // Çizim yaparken ya da aracımız 'selection' değilse selection aracına geç
        if ((isDrawing || activeTool !== 'selection') && onToolChange) {
          onToolChange('selection');
        }
      }
    };
    
    // Event listener ekle
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUndo, resetDrawingStates, activeTool, drawingLine, drawingPolyline, isDraggingEndpoint, onToolChange]);

  return {
    drawingLine,
    drawingPolyline,
    isDraggingEndpoint,
    isPanning: middleMouseDown,
    currentShape: currentShapeRef.current,
    lineFirstPoint: lineFirstPointRef.current,
    polylinePoints: polylinePointsRef.current,
    draggingLineEndpoint: draggingLineEndpointRef.current,
    originalLine: originalLineRef.current,
    middleMouseDown,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    handleWheel,
    handleContextMenu,
    handleDoubleClick,
    handleUndo,
    resetDrawingStates
  };
}
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CanvasState, Tool, Point } from '@/types';
import { screenToWorld, worldToScreen, drawGrid, drawShape, drawSnapIndicators } from '@/lib/canvasUtils';
import { pointNearLine, pointNearPolyline, distance, findNearestSnapPoint } from '@/lib/drawingPrimitives';

interface DrawingCanvasProps {
  canvasState: CanvasState;
  activeTool: Tool;
  onMousePositionChange: (position: Point) => void;
  onPanChange: (x: number, y: number) => void;
  onZoomChange: (zoom: number) => void;
  onCanvasSizeChange: (width: number, height: number) => void;
  onSelectObject?: (object: any) => void;
  onToolChange?: (tool: Tool) => void; // Aracı değiştirmek için prop ekledik
  snapEnabled?: boolean; // Snap özelliğinin açık/kapalı durumu
  orthoEnabled?: boolean; // Ortho modunun açık/kapalı durumu
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  canvasState,
  activeTool,
  onMousePositionChange,
  onPanChange,
  onZoomChange,
  onCanvasSizeChange,
  onSelectObject,
  onToolChange,
  snapEnabled = true, // Default olarak snap aktif
  orthoEnabled = false // Default olarak ortho kapalı
}) => {
  // DOM References
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Mutable References (State'in sonsuz döngü yapmaması için ref kullanıyoruz)
  const shapesRef = useRef<any[]>([]); 
  const shapesHistoryRef = useRef<any[][]>([]); // Şekillerin geçmiş durumlarını saklamak için
  const actionsHistoryRef = useRef<{action: string, data: any}[]>([]); // Yapılan işlemlerin tarihçesi
  const currentShapeRef = useRef<any | null>(null);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const lineFirstPointRef = useRef<Point | null>(null); // Çizgi ilk noktası referansı
  const requestRef = useRef<number | null>(null); // AnimationFrame request ID
  const nextIdRef = useRef<number>(1); // Şekiller için benzersiz ID'ler
  const draggingLineEndpointRef = useRef<'start' | 'end' | 'vertex' | null>(null); // Hangi uç veya noktanın sürüklendiği
  const originalLineRef = useRef<any | null>(null); // Sürükleme başladığında çizginin orijinal hali
  const currentMousePosRef = useRef<Point>({ x: 0, y: 0 }); // Mevcut fare pozisyonu
  const polylinePointsRef = useRef<Point[]>([]); // Polyline'ın noktaları
  const parallelPreviewsRef = useRef<any[]>([]); // Paralel çizgi önizlemeleri
  const [temporarySelection, setTemporarySelection] = useState<boolean>(false); // Geçici seçim modu (paralel modunda)
  
  // UI State (Cursor değişimi vb. için state kullanıyoruz)
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [drawingLine, setDrawingLine] = useState<boolean>(false); // Çizgi çizim durumu
  const [selectedShapeId, setSelectedShapeId] = useState<number | null>(null); // Seçilen şeklin ID'si
  const [isDraggingEndpoint, setIsDraggingEndpoint] = useState<boolean>(false); // Çizgi uç noktası sürükleme durumu
  const [drawingPolyline, setDrawingPolyline] = useState<boolean>(false); // Polyline çizim durumu
  
  // Handle canvas resize
  // Resize handler - onCanvasSizeChange'i ref olarak tutuyoruz
  const onCanvasSizeChangeRef = useRef(onCanvasSizeChange);

  // onCanvasSizeChange değiştiğinde referansı güncelle
  useEffect(() => {
    onCanvasSizeChangeRef.current = onCanvasSizeChange;
  }, [onCanvasSizeChange]);

  // Resize işlemleri için ayrı, sabit referanslı bir useEffect
  useEffect(() => {
    const resizeCanvas = () => {
      if (containerRef.current && canvasRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        onCanvasSizeChangeRef.current(width, height);
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []); // Boş bağımlılık dizisi - component mount olduğunda bir kez çalışır
  
  // Seçilen şekil ID'sini doğrudan prop olarak kullanalım - daha güvenli bir yaklaşım
  const selectedId = selectedShapeId;

  // Render işlevi - render frame içinde kullanılacak
  // İşlevi memoize ediyoruz (önceden hesaplayıp saklıyoruz), böylece her render'da yeniden oluşmaz
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Canvas'ı temizle
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Izgarayı çiz
    drawGrid(ctx, canvasState);
    
    // Tüm şekilleri çiz
    shapesRef.current.forEach(shape => {
      // Seçilen şekil ise farklı renkte çiz, bunlar tamamlanmış şekiller olduğu için isPreview=false
      drawShape(ctx, shape, canvasState, shape.id === selectedId, false);
    });
    
    // Oluşturulmakta olan şekli çiz - bu bir önizleme olduğu için isPreview=true
    if (currentShapeRef.current) {
      drawShape(ctx, currentShapeRef.current, canvasState, false, true);
    }
    
    // Paralel çizgi önizlemelerini çiz
    if (parallelPreviewsRef.current.length > 0) {
      // Fare konumunu al
      const mousePos = { x: currentMousePosRef.current.x, y: currentMousePosRef.current.y };
      
      // İki paralel çizgimiz varsa (bir orijinal çizginin iki tarafında)
      if (parallelPreviewsRef.current.length === 2) {
        // Orijinal çizgiyi bulalım (ilk çizginin kaynak çizgisi)
        const originalLine = {
          startX: (parallelPreviewsRef.current[0].startX + parallelPreviewsRef.current[1].startX) / 2,
          startY: (parallelPreviewsRef.current[0].startY + parallelPreviewsRef.current[1].startY) / 2,
          endX: (parallelPreviewsRef.current[0].endX + parallelPreviewsRef.current[1].endX) / 2,
          endY: (parallelPreviewsRef.current[0].endY + parallelPreviewsRef.current[1].endY) / 2,
        };
        
        // Orijinal çizginin vektörünü hesapla
        const dx = originalLine.endX - originalLine.startX;
        const dy = originalLine.endY - originalLine.startY;
        
        // Orijinal çizginin ortası
        const midX = (originalLine.startX + originalLine.endX) / 2;
        const midY = (originalLine.startY + originalLine.endY) / 2;
        
        // Dünya koordinatlarındaki fare konumu - x ve y değerlerini ayrı ayrı gönder
        const worldMouse = screenToWorld(mousePos.x, mousePos.y, canvasState);
        
        // Fare ile orijinal çizginin ortası arasındaki vektör
        const mouseVectorX = worldMouse.x - midX;
        const mouseVectorY = worldMouse.y - midY;
        
        // Çizginin vektörü ile fare vektörünün çapraz çarpımı
        // Bu çapraz çarpım bize fare pozisyonunun çizginin hangi tarafında olduğunu söyler
        const crossProduct = dx * mouseVectorY - dy * mouseVectorX;
        
        // Çapraz çarpımın işareti, hangi paralel çizginin çizileceğini belirler
        const lineIndex = crossProduct > 0 ? 0 : 1; // Pozitif ise 0, negatif ise 1
        
        // Sadece seçilen taraftaki çizgiyi çiz
        drawShape(ctx, parallelPreviewsRef.current[lineIndex], canvasState, false, true);
      } else {
        // Eğer iki çizgi yoksa, mevcut tüm çizgileri çiz
        parallelPreviewsRef.current.forEach(line => {
          drawShape(ctx, line, canvasState, false, true);
        });
      }
    }
    
    // Eğer snap özelliği açıksa veya line uçları çekilirken yakalama noktalarını göster
    if ((snapEnabled && currentMousePosRef.current) && (activeTool !== 'selection' || isDraggingEndpoint)) {
      // En yakın yakalama noktasını bul
      const snapTolerance = 10 / canvasState.zoom;
      
      // Seçili şeklin ID'sini dışlayarak en yakın yakalama noktasını bul
      const excludedId = isDraggingEndpoint ? selectedId : undefined;
      const closestPoint = findNearestSnapPoint(currentMousePosRef.current, shapesRef.current, snapTolerance, excludedId);
      
      // Bu bir extension snap point ise uzantı çizgisini görselleştir
      if (closestPoint && closestPoint.isExtension && closestPoint.lineStart && closestPoint.lineEnd && ctx) {
        // console.log("Extension noktası bulundu:", closestPoint);
        
        // Çizgi başlangıç ve bitiş noktalarını ekran koordinatlarına dönüştür
        const lineStart = worldToScreen(closestPoint.lineStart.x, closestPoint.lineStart.y, canvasState);
        const lineEnd = worldToScreen(closestPoint.lineEnd.x, closestPoint.lineEnd.y, canvasState);
        
        // Extension çizgisini çiz (kesik çizgilerle)
        // Çizginin her iki yönde de uzantısını göster
        // Çizgi vektörünü oluştur
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        
        // Çizgiyi her iki yönde de uzat
        const extensionLength = Math.max(canvasRef.current!.width, canvasRef.current!.height) * 2; // Tüm canvas boyunca uzat
        
        // Normalize et
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 0) { // 0'a bölmeyi önle
          const normalizedDx = dx / length;
          const normalizedDy = dy / length;
          
          // Başlangıç noktasından geriye doğru uzat
          const startExtensionX = lineStart.x - normalizedDx * extensionLength;
          const startExtensionY = lineStart.y - normalizedDy * extensionLength;
          
          // Bitiş noktasından ileriye doğru uzat
          const endExtensionX = lineEnd.x + normalizedDx * extensionLength;
          const endExtensionY = lineEnd.y + normalizedDy * extensionLength;
          
          // Extension çizgisini çiz (kesik çizgilerle ve şeffaf)
          ctx.beginPath();
          ctx.moveTo(startExtensionX, startExtensionY);
          ctx.lineTo(endExtensionX, endExtensionY);
          ctx.strokeStyle = 'rgba(0, 200, 83, 0.3)'; // Açık yeşil ve şeffaf
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]); // Kesik çizgi
          ctx.stroke();
          ctx.setLineDash([]); // Dash ayarını sıfırla
        }
      }
      
      // En yakın yakalama noktası varsa görsel olarak göster
      if (closestPoint) {
        // Dünya koordinatlarını ekran koordinatlarına çevir
        const screenPos = worldToScreen(closestPoint.x, closestPoint.y, canvasState);
        
        // Yeşil daire çiz
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#00C853';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // İçi beyaz daire
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#00C853';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }, [canvasState, selectedId, activeTool, snapEnabled, isDraggingEndpoint]); // isDragging'i kaldırdık, sadece gerçekten gerekli bağımlılıkları kaldık
  
  // Bileşen takılı olduğunda animasyon loop'unu çalıştır, söküldüğünde temizle
  // renderCanvas'ı bağımlılık olarak kullanmayacağız - animasyon loop'u içinde current referansını kullanacağız
  const renderCanvasRef = useRef(renderCanvas);
  
  // renderCanvas fonksiyonu değiştiğinde referansı güncelle
  useEffect(() => {
    renderCanvasRef.current = renderCanvas;
  }, [renderCanvas]);
  
  // Animasyon loop'u için ayrı bir useEffect
  useEffect(() => {
    // Animasyon frame'i yönet
    const animate = () => {
      // renderCanvas yerine renderCanvasRef.current'i kullan
      renderCanvasRef.current();
      requestRef.current = requestAnimationFrame(animate);
    };
    
    // İlk frame'i başlat
    requestRef.current = requestAnimationFrame(animate);
    
    // Cleanup işlevi
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, []); // Bileşen takıldığında bir kez çalışsın, renderCanvas değişse bile yeniden çalışmasın
  
  // =========== OLAY İŞLEYİCİLERİ ===========
  
  // Mouse event handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates
    const worldPos = screenToWorld(x, y, canvasState);
    
    // Yakalama özelliği için fare pozisyonunu güncelle
    currentMousePosRef.current = worldPos;
    
    // Update mouse position in parent component
    onMousePositionChange(worldPos);
    
    // Polyline çizimi sırasında önizleme çizgisini göster
    if (activeTool === 'polyline' && drawingPolyline && polylinePointsRef.current.length > 0) {
      // Mevcut çizilen polyline noktalarını geçici şekil olarak oluştur
      // Böylece bunlar da snap noktaları olarak kullanılabilir
      const temporaryPolylinePoints = [...polylinePointsRef.current];
      const temporaryPolyline = {
        id: -999, // Geçici bir ID
        type: 'polyline',
        points: temporaryPolylinePoints,
        thickness: 1,
        closed: false
      };
      
      // Geçici şekli snap kontrolleri için ekle, ama asıl şekiller listesini değiştirme
      const shapesWithTempPolyline = [...shapesRef.current, temporaryPolyline];
      
      // Snap kontrolü (şimdi geçici polyline da dahil)
      const snapTolerance = 10 / canvasState.zoom;
      const snapPoint = snapEnabled
        ? findNearestSnapPoint(worldPos, shapesWithTempPolyline, snapTolerance)
        : null;
      
      // Fare pozisyonu veya snap noktası
      const currentPoint = snapPoint || worldPos;
      
      // Önizleme çizgisini güncelle - sadece fare pozisyonunu değiştiriyoruz, gerçek noktaları değil
      if (currentShapeRef.current && currentPoint) {
        // Mevcut noktaları kopyala, değiştirmeyelim
        const currentPoints = [...polylinePointsRef.current];
        
        // Önizleme çizgisini oluşturmak için son noktaya fareyi ekle
        const allPoints = [...currentPoints, currentPoint];
        
        // Polyline önizlemesini güncelle
        currentShapeRef.current = {
          ...currentShapeRef.current,
          points: allPoints
        };
      }
    }
    // Çizgi çizme modu ve birinci noktası varsa, geçici çizgi çiz
    else if (activeTool === 'line' && drawingLine && lineFirstPointRef.current) {
      // Snap kontrolü
      const snapTolerance = 10 / canvasState.zoom;
      const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
      
      // Snap noktası veya fare pozisyonu - işlem önceliği snap noktasına
      let secondPoint = snapPoint || worldPos;
      
      // Ortho modu açıksa çizgiyi yatay veya dikey zorla
      if (orthoEnabled && !snapPoint) { // Snap noktası varsa ortho modu geçersiz kıl
        // İlk nokta ile fare pozisyonu arasındaki delta değerlerini hesapla
        const firstPoint = lineFirstPointRef.current;
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
      
      // Önizleme çizgisini güncelle
      if (currentShapeRef.current) {
        currentShapeRef.current = {
          ...currentShapeRef.current,
          startX: lineFirstPointRef.current.x,
          startY: lineFirstPointRef.current.y,
          endX: secondPoint.x,
          endY: secondPoint.y,
          isSnapping: !!snapPoint,
          isDashed: true
        };
      }
    }
  };
  
  // MOUSE DOWN - fare tıklama olayı
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates
    const worldPos = screenToWorld(x, y, canvasState);
    
    // Right-click - sağ fare tuşu ile iptal et ve bağlam menüsünü önle
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // Middle mouse button - orta fare tuşu (tekerlek) ile pan yap
    if (e.button === 1) {
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    
    // Left mouse button - sol fare tuşu
    if (e.button === 0) {
      // Selection tool
      if (activeTool === 'selection') {
        // Find and select a shape at this position
        const selectedShape = findShapeAtPoint(worldPos);
        
        if (selectedShape) {
          // Set the selected shape
          setSelectedShapeId(selectedShape.id);
          if (onSelectObject) onSelectObject(selectedShape);
        } else {
          // Clear selection if clicked on empty space
          setSelectedShapeId(null);
          if (onSelectObject) onSelectObject(null);
        }
      }
      // Drawing tools
      else if (activeTool === 'line') {
        // If first point not set yet, set it and start line drawing
        if (!drawingLine) {
          // Snap kontrolü
          const snapTolerance = 10 / canvasState.zoom;
          const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
          
          // First point is either a snap point or mouse position
          lineFirstPointRef.current = snapPoint || worldPos;
          
          // Create temporary line
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
          
          setDrawingLine(true);
        } 
        // Second click - complete the line
        else {
          // Snap kontrolü
          const snapTolerance = 10 / canvasState.zoom;
          const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
          
          // Second point is either a snap point or mouse position
          let secondPoint = snapPoint || worldPos;
          
          // Ortho modu açıksa, çizgiyi yatay veya dikey zorla
          if (orthoEnabled && !snapPoint && lineFirstPointRef.current) { // Snap noktası varsa, snap'e öncelik ver
            // İlk nokta ile fare pozisyonu arasındaki delta değerlerini hesapla
            const firstPoint = lineFirstPointRef.current;
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
          
          // Create the final line
          const newLine = {
            id: nextIdRef.current++,
            type: 'line',
            startX: lineFirstPointRef.current!.x,
            startY: lineFirstPointRef.current!.y,
            endX: secondPoint.x,
            endY: secondPoint.y,
            thickness: 1
          };
          
          // İşlem tarihçesine ekle
          actionsHistoryRef.current.push({
            action: 'add_shape',
            data: { shapeId: newLine.id }
          });
          
          // Add line to shapes
          shapesRef.current.push(newLine);
          
          // Reset for next line
          lineFirstPointRef.current = null;
          currentShapeRef.current = null;
          setDrawingLine(false);
        }
      }
      else if (activeTool === 'polyline') {
        // Snap kontrolü
        const snapTolerance = 10 / canvasState.zoom;
        const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
        
        // Noktayı ekle (snap noktası ya da fare pozisyonu)
        const point = snapPoint || worldPos;
        
        // İlk nokta
        if (polylinePointsRef.current.length === 0) {
          polylinePointsRef.current.push(point);
          setDrawingPolyline(true);
          
          // Create temporary polyline
          currentShapeRef.current = {
            id: nextIdRef.current,
            type: 'polyline',
            points: [point],
            thickness: 1,
            closed: false,
            isPreview: true
          };
        } 
        // Daha sonraki noktalar
        else {
          // Ortho modu açıksa, son noktadan bu noktaya çizgiyi yatay veya dikey zorla
          if (orthoEnabled && !snapPoint && polylinePointsRef.current.length > 0) {
            const lastPoint = polylinePointsRef.current[polylinePointsRef.current.length - 1];
            const dx = Math.abs(point.x - lastPoint.x);
            const dy = Math.abs(point.y - lastPoint.y);
            
            // Yatay veya dikey çizme
            let newPoint;
            if (dx > dy) {
              // Yatay
              newPoint = { x: point.x, y: lastPoint.y };
            } else {
              // Dikey
              newPoint = { x: lastPoint.x, y: point.y };
            }
            
            polylinePointsRef.current.push(newPoint);
          } else {
            // Normal nokta ekle
            polylinePointsRef.current.push(point);
          }
          
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
        // Snap kontrolü
        const snapTolerance = 10 / canvasState.zoom;
        const snapPoint = snapEnabled ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance) : null;
        
        // Create point at snap position or mouse position
        const newPoint = {
          id: nextIdRef.current++,
          type: 'point',
          x: (snapPoint || worldPos).x,
          y: (snapPoint || worldPos).y,
          style: 'default'
        };
        
        // İşlem tarihçesine ekle
        actionsHistoryRef.current.push({
          action: 'add_shape',
          data: { shapeId: newPoint.id }
        });
        
        // Add point to shapes
        shapesRef.current.push(newPoint);
      }
    }
  };
  
  // MOUSE UP - fare bırakma olayı
  const handleMouseUp = () => {
    // Update dragging state
    setIsDragging(false);
    isDraggingRef.current = false;
    
    // Çizgi uç noktası sürükleme işlemi bittiğinde, işlem tarihçesine kaydet
    if (isDraggingEndpoint && selectedShapeId !== null) {
      const shapeIndex = shapesRef.current.findIndex(shape => shape.id === selectedShapeId);
      if (shapeIndex !== -1 && originalLineRef.current) {
        // İşlem tarihçesine orijinal durumu ekle
        actionsHistoryRef.current.push({
          action: 'update_shape',
          data: { originalShape: originalLineRef.current }
        });
        
        // Durumu temizle
        setIsDraggingEndpoint(false);
        draggingLineEndpointRef.current = null;
        originalLineRef.current = null;
      }
    }
  };
  
  // WHEEL - fare tekerleği olayı (zoom)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
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
  };

  // GERI ALMA (Undo) işlemi
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
              setSelectedShapeId(null);
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
                setSelectedShapeId(null);
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
    
  }, [selectedShapeId, onSelectObject]);

  // Klavye event listener'ı
  useEffect(() => {
    // Klavye eventleri için handler
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z / Cmd+Z ile geri alma
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Escape tuşu - çizim modunu iptal et
      if (e.key === 'Escape') {
        // Çizgi çizimi iptal etme
        if (drawingLine) {
          lineFirstPointRef.current = null;
          currentShapeRef.current = null;
          setDrawingLine(false);
        }
        
        // Polyline çizimi iptal etme
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
        
        // Selection tool'a geç
        if (activeTool !== 'selection' && onToolChange) {
          onToolChange('selection');
        }
      }
    };
    
    // Event listenerları ekle
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTool, onSelectObject, onToolChange, drawingLine, drawingPolyline, isDraggingEndpoint, handleUndo]);

  // Custom event handlers - Şekil güncelleme ve alma için
  useEffect(() => {
    if (containerRef.current) {
      const containerElement = containerRef.current;
      
      // Tüm şekilleri almak için kullanılan event listener
      const getAllShapesHandler = ((e: any) => {
        if (e.detail && typeof e.detail.callback === 'function') {
          e.detail.callback(shapesRef.current);
        }
      }) as EventListener;
      
      // Şekil güncelleme ve ekleme olayını dinle
      const shapeUpdateHandler = ((e: any) => {
        if (e.detail) {
          // BATCH işlemi (toplu ekleme) - en üstte kontrol ediyoruz
          if (e.detail.type === 'batch' && Array.isArray(e.detail.shapes)) {
            console.log("TEST PARALEL: Batch şekil ekleme işlemi başladı");
            
            // İşlem tarihçesine tek bir toplu işlem olarak ekle
            const shapeIds: number[] = [];
            
            // Her şekli ekle
            e.detail.shapes.forEach((shape: any) => {
              const newShape = { ...shape };
              shapesRef.current.push(newShape);
              shapeIds.push(newShape.id);
              console.log("TEST PARALEL: Toplu şekil eklendi:", newShape);
            });
            
            // Tüm şekilleri tek bir işlem olarak tarihçeye ekle
            actionsHistoryRef.current.push({
              action: 'batch_add_shapes',
              data: { shapeIds }
            });
          }
          // TEKİL İŞLEMLER - tek bir şekil için
          else if (e.detail.shape) {
            // Güncelleme işlemi
            if (e.detail.type === 'update') {
              // Güncellenecek şekli bul
              const shapeIndex = shapesRef.current.findIndex(
                (s: any) => s.id === e.detail.shape.id
              );
              
              if (shapeIndex !== -1) {
                // Orijinal şekli kaydet (geri almak için)
                const originalShape = { ...shapesRef.current[shapeIndex] };
                
                // İşlem tarihçesine ekle
                actionsHistoryRef.current.push({
                  action: 'update_shape',
                  data: { originalShape }
                });
                
                // Şekli güncelle
                shapesRef.current[shapeIndex] = { ...e.detail.shape };
              }
            } 
            // Ekleme işlemi
            else if (e.detail.type === 'add') {
              // Yeni şekli ekle
              const newShape = { ...e.detail.shape };
              
              // İşlem tarihçesine ekle
              actionsHistoryRef.current.push({
                action: 'add_shape',
                data: { shapeId: newShape.id }
              });
              
              // Şekli ekle
              shapesRef.current.push(newShape);
              console.log("Şekil eklendi:", newShape);
            }
          }
        }
      }) as EventListener;
      
      // Event listener'ları ekle - yalnızca hala kullanılanlar
      containerElement.addEventListener('getAllShapes', getAllShapesHandler);
      containerElement.addEventListener('shapeupdate', shapeUpdateHandler);
      
      // Cleanup function
      return () => {
        containerElement.removeEventListener('getAllShapes', getAllShapesHandler);
        containerElement.removeEventListener('shapeupdate', shapeUpdateHandler);
      };
    }
    
    // Cleanup gerekmez
    return undefined;
  }, []); // Component mount olduğunda sadece bir kez çalışsın
  
  // Çizginin başlangıç noktasında mı tıklandı kontrolü
  const isNearLineStart = (line: any, point: Point, tolerance: number): boolean => {
    return distance(point, { x: line.startX, y: line.startY }) <= tolerance;
  };
  
  // Çizginin bitiş noktasında mı tıklandı kontrolü
  const isNearLineEnd = (line: any, point: Point, tolerance: number): boolean => {
    return distance(point, { x: line.endX, y: line.endY }) <= tolerance;
  };
  
  // Çizgi uç noktalarından birinde mi tıklandı kontrolü
  const getLineEndpoint = (line: any, point: Point, tolerance: number): 'start' | 'end' | null => {
    // Bitiş noktası (daha önce çizileni kolay seçmek için)
    if (isNearLineEnd(line, point, tolerance)) {
      return 'end';
    }
    // Başlangıç noktası
    if (isNearLineStart(line, point, tolerance)) {
      return 'start';
    }
    return null;
  };
  
  // Helper function to find the shape under a given point
  // Polyline noktalarını kontrol edip taşınabilecek noktayı bulur
  const getPolylineVertexAtPoint = (polyline: any, point: Point, tolerance: number): number | null => {
    if (!polyline.points || !Array.isArray(polyline.points)) return null;
    
    // Tüm noktaları kontrol et
    for (let i = 0; i < polyline.points.length; i++) {
      const vertex = polyline.points[i];
      
      // Nokta ile vertex arasındaki mesafeyi hesapla
      const dist = distance(point, vertex);
      
      // Eğer mesafe toleransın içindeyse, bu noktanın indeksini döndür
      if (dist <= tolerance) {
        return i; // Taşınacak noktanın indeksi
      }
    }
    
    return null; // Hiçbir nokta tolerans içinde değil
  };

  // Find a shape at the given point
  const findShapeAtPoint = (point: Point): any | null => {
    // Zoom seviyesine göre seçim toleransını hesapla
    // Zoom büyükse tolerans düşük, zoom küçükse tolerans yüksek olmalı
    const baseTolerance = 20; // Baz tolerans değeri artırıldı - daha kolay seçim için
    const zoomAdjustedTolerance = baseTolerance / canvasState.zoom;
    
    // En düşük ve en yüksek tolerans sınırları
    const minTolerance = 5;  // Min değer artırıldı - düşük zoomlarda bile seçilebilir
    const maxTolerance = 25; // Max değer artırıldı - yüksek zoomlarda bile seçilebilir
    
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
  };

  // Right-click menu handler
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
  };

  // Çift tıklama ile polyline'ı tamamlamak için
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
  };

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0"
    >
      <canvas
        ref={canvasRef}
        className="absolute bg-white"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
};

export default DrawingCanvas;
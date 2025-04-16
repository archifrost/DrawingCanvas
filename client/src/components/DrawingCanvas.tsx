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
        
      // Extension doğrultularını göstermek için - extension kontrolü
      if (snapPoint && snapPoint.isExtension && snapPoint.lineStart && snapPoint.lineEnd && canvasRef.current) {
        const tempCtx = canvasRef.current.getContext('2d');
        const lineStart = worldToScreen(snapPoint.lineStart.x, snapPoint.lineStart.y, canvasState);
        const lineEnd = worldToScreen(snapPoint.lineEnd.x, snapPoint.lineEnd.y, canvasState);
        
        // Extension çizgisini çiz (kesik çizgilerle)
        ctx.current.beginPath();
        
        // Çizginin her iki yönde de uzantısını göster
        // Çizgi vektörünü oluştur
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        
        // Çizgiyi her iki yönde de uzat
        const extensionLength = Math.max(ctx.current.canvas.width, ctx.current.canvas.height); // Tüm canvas boyunca uzat
        
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
          ctx.current.beginPath();
          ctx.current.moveTo(startExtensionX, startExtensionY);
          ctx.current.lineTo(endExtensionX, endExtensionY);
          ctx.current.strokeStyle = 'rgba(0, 200, 83, 0.3)'; // Açık yeşil ve şeffaf
          ctx.current.lineWidth = 1;
          ctx.current.setLineDash([5, 5]); // Kesik çizgi
          ctx.current.stroke();
          ctx.current.setLineDash([]); // Dash ayarını sıfırla
        }
      }
      
      // Fare pozisyonu veya snap noktası
      const currentPoint = snapPoint || worldPos;
      
      // Önizleme çizgisini güncelle - sadece fare pozisyonunu değiştiriyoruz, gerçek noktaları değil
      if (currentShapeRef.current && currentPoint) {
        // Mevcut noktaları kopyala, değiştirmeyelim
        const currentPoints = [...polylinePointsRef.current];
        
        // Önizleme noktasını güncelle - bu sadece çizim için
        currentShapeRef.current = {
          id: currentShapeRef.current.id || -1,
          type: 'polyline',
          points: currentPoints,  // Orijinal noktaları kullan
          thickness: 1,
          closed: false,
          previewPoint: currentPoint, // Önizleme noktası ekle
          isSnapping: !!snapPoint
        };
      }
    }
    
    // SADECE orta fare tuşu (wheel button) ile pan yapmaya izin ver (buttons=4)
    if (e.buttons === 4) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      
      onPanChange(
        canvasState.panOffset.x + dx,
        canvasState.panOffset.y + dy
      );
      
      // Güncelleme sonrası başlangıç noktasını güncelle
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    } 
    
    // Çizgi veya polyline noktası sürükleme işlemi
    else if (isDraggingEndpoint && draggingLineEndpointRef.current && selectedShapeId !== null && (e.buttons === 1)) {
      // Hangi şeklin düzenleneceğini bul
      const shapeIndex = shapesRef.current.findIndex(shape => shape.id === selectedShapeId);
      if (shapeIndex !== -1) {
        // Şekli bul
        const shape = shapesRef.current[shapeIndex];
        
        // Snap özelliği için kontrol yap
        const snapTolerance = 10 / canvasState.zoom; // Zoom'a göre ayarlanmış tolerans
        // Snap özelliği kapalıysa null, açıksa en yakın snap noktasını kullan
        // Seçili olan şeklin kendi snap noktalarını hariç tut (kendisine yapışmasın)
        const snapPoint = snapEnabled
          ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance, selectedShapeId)
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
          
          // Geçici şekli snap kontrolleri için ekle, ama orijinal listeyi değiştirme
          const shapesWithTempPolyline = [...shapesRef.current, tempPolyline];
          
          // Snap (yakalama) noktası kontrolü - güncel şekil listesi ile
          const snapTolerance = 10 / canvasState.zoom; // Zoom'a göre ayarlanmış tolerans
          // Snap özelliği kapalıysa null, açıksa en yakın snap noktasını kullan
          const snapPoint = snapEnabled
            ? findNearestSnapPoint(worldPos, shapesWithTempPolyline, snapTolerance)
            : null;
          
          // Eğer yakalama noktası varsa onu kullan, yoksa normal fare pozisyonunu kullan
          let currentPoint = snapPoint || worldPos;
          
          // Ortho modu açıksa, çizgiyi yatay veya dikey olarak zorla
          if (orthoEnabled && !snapPoint && polylinePointsRef.current.length > 0) {
            // Son eklenen nokta ile fare pozisyonu arasında ortho modu uygula
            const lastPoint = polylinePointsRef.current[polylinePointsRef.current.length - 1];
            
            // Son nokta ile fare pozisyonu arasındaki delta değerlerini hesapla
            const dx = Math.abs(currentPoint.x - lastPoint.x);
            const dy = Math.abs(currentPoint.y - lastPoint.y);
            
            // Hangisi daha büyük - yatay veya dikey çizim
            if (dx > dy) {
              // Yatay çizgi (y değerini sabit tut)
              currentPoint = {
                x: currentPoint.x,
                y: lastPoint.y
              };
            } else {
              // Dikey çizgi (x değerini sabit tut)
              currentPoint = {
                x: lastPoint.x,
                y: currentPoint.y
              };
            }
          }
          
          // Tüm noktaları koruyarak son noktayı fare pozisyonuyla güncelle (çizim önizlemesi için)
          if (currentShapeRef.current) {
            // Mevcut noktaları al
            const points = [...polylinePointsRef.current];
            
            // Şu anki fare pozisyonunu geçici olarak ekle (taslak gösterim için)
            const tempPoints = [...points, { x: currentPoint.x, y: currentPoint.y }];
            
            // Güncel şekli güncelle
            currentShapeRef.current = {
              ...currentShapeRef.current,
              points: points, // Önizleme noktasını dahil etme, bunu previewPoint ile yapıyoruz
              previewPoint: currentPoint, // Önizleme noktası olarak kullan
              // Yakalama noktası varsa bunu görsel olarak belirt
              isSnapping: !!snapPoint
            };
          }
        }
      }
      // Diğer şekil çizimleri için sürükle-bırak davranışı (fare basılı tutulduğunda)
      else if (isDraggingRef.current) {
        if (activeTool === 'point') {
          // Nothing to update for point
        }
        // Rectangle ve circle araçları kaldırıldı
      }
    }
  };
  
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
          
        // Rectangle ve circle case'leri kaldırıldı
          
        case 'text':
          // For text, simplified check using a rectangular area
          // Would need more sophisticated checking for actual text bounds
          // Create a bounding box for the text
          const textBounds = {
            x: shape.x,
            y: shape.y - shape.fontSize,
            width: shape.text.length * shape.fontSize * 0.6, // Rough estimate
            height: shape.fontSize * 1.2
          };
          
          // Text için de biraz tolerans ekle
          const expandedTextBounds = {
            x: textBounds.x - tolerance,
            y: textBounds.y - tolerance,
            width: textBounds.width + 2 * tolerance,
            height: textBounds.height + 2 * tolerance
          };
          
          if (point.x >= expandedTextBounds.x && 
              point.x <= expandedTextBounds.x + expandedTextBounds.width && 
              point.y >= expandedTextBounds.y && 
              point.y <= expandedTextBounds.y + expandedTextBounds.height) {
            return shape;
          }
          break;
      }
    }
    
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert to world coordinates
    const worldPos = screenToWorld(x, y, canvasState);
    
    // Paralel çizgi kodu tamamen kaldırıldı
    
    // Orta fare tuşu için kaydırma (pan) işlemini başlat
    if (e.button === 1) { // 1 = orta fare tuşu (tekerlek)
      isDraggingRef.current = true;
      setIsDragging(true); // UI için
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      
      // Cursor doğrudan burada ayarlanıyor
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing';
      }
      return;
    }
    
    // Sol fare tuşu için araçlara göre farklı davranışlar
    if (e.button === 0) { // 0 = sol fare tuşu
      if (activeTool === 'selection') {
        // Selection tool için nesne seçme
        const selectedShape = findShapeAtPoint(worldPos);
        
        if (selectedShape && onSelectObject) {
          // Seçili şeklin indeksini bul
          const shapeIndex = shapesRef.current.findIndex(s => s.id === selectedShape.id);
          
          // Seçili şeklin ID'sini ayarla
          setSelectedShapeId(selectedShape.id);
          
          // Canvas'ın yeniden çizilmesini sağlamak için referansı güncelle
          if (shapeIndex !== -1) {
            shapesRef.current[shapeIndex] = { ...selectedShape };
          }
          
          onSelectObject(selectedShape);
        } else {
          // Hiçbir şekil seçilmediyse seçimi temizle
          setSelectedShapeId(null);
          if (onSelectObject) onSelectObject(null);
        }
      } else {
        // Diğer çizim araçları için
        isDraggingRef.current = true;
        setIsDragging(true); // UI için
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        
        if (activeTool === 'point') {
          // Snap özelliği için kontrol yap
          const snapTolerance = 10 / canvasState.zoom; // Zoom'a göre ayarlanmış tolerans
          // Snap özelliği kapalıysa null, açıksa en yakın snap noktasını kullan
          const snapPoint = snapEnabled
            ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance)
            : null;
          
          // Eğer yakalama noktası varsa onu kullan, yoksa normal fare pozisyonunu kullan
          const pointPosition = snapPoint || worldPos;
          
          // Yeni nokta oluştur
          const newPoint = {
            id: nextIdRef.current++,
            type: 'point',
            x: pointPosition.x,
            y: pointPosition.y,
            style: 'default'
          };
          
          // İşlem tarihçesine ekle (geri almak için)
          actionsHistoryRef.current.push({
            action: 'add_shape',
            data: { shapeId: newPoint.id }
          });
          
          // Şekli ekle
          shapesRef.current.push(newPoint);
          // Otomatik seçim özelliğini kaldırdık
        } else if (activeTool === 'line') {
          // Eğer daha önce ilk nokta seçilmemişse (çizgi çizme işleminin başlangıcı)
          if (!drawingLine) {
            // Snap (yakalama) noktası kontrolü - en yakın yakalama noktasını bul
            const snapTolerance = 10 / canvasState.zoom; // Zoom'a göre ayarlanmış tolerans
            // Snap özelliği kapalıysa null, açıksa en yakın snap noktasını kullan
            const snapPoint = snapEnabled
              ? findNearestSnapPoint(worldPos, shapesRef.current, snapTolerance)
              : null;
            
            // Eğer yakalama noktası varsa onu kullan, yoksa normal fare pozisyonunu kullan
            const startPoint = snapPoint || worldPos;
            
            // İlk noktayı kaydet
            lineFirstPointRef.current = { x: startPoint.x, y: startPoint.y };
            setDrawingLine(true);
            
            // Geçici gösterim için çizgi oluştur
            currentShapeRef.current = {
              type: 'line',
              startX: startPoint.x,
              startY: startPoint.y,
              endX: startPoint.x,
              endY: startPoint.y,
              thickness: 1
            };
          } else {
            // İkinci tıklama - çizgiyi tamamla
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
              
              // Tamamlanmış çizgiyi oluştur
              const newLine = {
                id: nextIdRef.current++,
                type: 'line',
                startX: lineFirstPointRef.current.x,
                startY: lineFirstPointRef.current.y,
                endX: endPoint.x,
                endY: endPoint.y,
                thickness: 1
              };
              
              // İşlem tarihçesine ekle
              actionsHistoryRef.current.push({
                action: 'add_shape',
                data: { shapeId: newLine.id }
              });
              
              // Şekli ekle
              shapesRef.current.push(newLine);
              
              // Otomatik seçim özelliğini kaldırdık
              
              // Çizim modunu kapat ve referansları temizle
              lineFirstPointRef.current = null;
              currentShapeRef.current = null;
              setDrawingLine(false);
            }
          }
        } else if (activeTool === 'polyline') {
          // Sürükleme durumunu kaldır - polyline çizerken sürükleme kullanmıyoruz
          isDraggingRef.current = false;
          setIsDragging(false);
          
          // Eğer devam eden bir polyline çizimi varsa, mevcut noktaları dikkate al
          let shapesWithTempPolyline = [...shapesRef.current];
          if (drawingPolyline && polylinePointsRef.current.length > 0) {
            // Şu anda çizilmekte olan polyline noktalarını da dikkate al
            const tempPolyline = {
              id: -999, // Geçici ID
              type: 'polyline',
              points: [...polylinePointsRef.current],
              thickness: 1,
              closed: false
            };
            shapesWithTempPolyline.push(tempPolyline);
          }
          
          // Snap (yakalama) noktası kontrolü - güncellenmiş şekil listemizi kullanalım
          const snapTolerance = 10 / canvasState.zoom; // Zoom'a göre ayarlanmış tolerans
          // Snap özelliği kapalıysa null, açıksa en yakın snap noktasını kullan
          const snapPoint = snapEnabled
            ? findNearestSnapPoint(worldPos, shapesWithTempPolyline, snapTolerance)
            : null;
          
          // Eğer yakalama noktası varsa onu kullan, yoksa normal fare pozisyonunu kullan
          const clickPoint = snapPoint || worldPos;
          
          // Eğer polyline çizimi başlamadıysa, başlat
          if (!drawingPolyline) {
            // Yeni polyline başlat
            polylinePointsRef.current = [{ x: clickPoint.x, y: clickPoint.y }];
            setDrawingPolyline(true);
            
            // Geçici gösterim için polyline oluştur (ilk nokta)
            currentShapeRef.current = {
              id: -1, // Geçici ID
              type: 'polyline',
              points: [...polylinePointsRef.current],
              thickness: 1,
              closed: false,
              previewPoint: clickPoint // İlk nokta için önizleme ekle
            };
          } else {
            // Polyline'a yeni nokta ekle
            // Son eklenen nokta ile konumu hesapla
            let newPoint = { x: clickPoint.x, y: clickPoint.y };
            
            // Ortho modu açıksa ve en az bir nokta eklenmişse, yeni noktayı ortho modunda ekle
            if (orthoEnabled && !snapPoint && polylinePointsRef.current.length > 0) {
              const lastPoint = polylinePointsRef.current[polylinePointsRef.current.length - 1];
              
              // Son nokta ile fare pozisyonu arasındaki delta değerlerini hesapla
              const dx = Math.abs(newPoint.x - lastPoint.x);
              const dy = Math.abs(newPoint.y - lastPoint.y);
              
              // Hangisi daha büyük - yatay veya dikey çizim
              if (dx > dy) {
                // Yatay çizgi (y değerini sabit tut)
                newPoint = {
                  x: newPoint.x,
                  y: lastPoint.y
                };
              } else {
                // Dikey çizgi (x değerini sabit tut)
                newPoint = {
                  x: lastPoint.x,
                  y: newPoint.y
                };
              }
            }
            
            polylinePointsRef.current.push(newPoint);
            
            // Geçici gösterimi güncelle - noktalar ve mevcut fare konumu
            if (currentShapeRef.current) {
              currentShapeRef.current = {
                ...currentShapeRef.current,
                points: [...polylinePointsRef.current],
                previewPoint: newPoint // Mevcut tıklama noktasına önizleme güncelle
              };
            }
          }
        // Rectangle ve circle araçları kaldırıldı
        }
      }
    }
  };
  

  
  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDragging(false); // UI için
    
    // Çizgi uç noktası sürükleme işlemini sonlandır
    if (isDraggingEndpoint && originalLineRef.current) {
      // Şekil ID'sini bul
      const shapeId = originalLineRef.current.id;
      
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
  };
  
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
  
  // İlk render için olan useEffect kaldırıldı çünkü artık activeTool değişim efekti bunu kapsıyor
  
  // ESKİ EVENT SİSTEMİ TAMAMEN KALDIRILDI
  // Bu eski useEffect'ler ve event handler'ları kaldırıldı çünkü yeni sistemde
  // zaten aynı olayları dinleyen başka bir useEffect var ve bu iki dinleyicinin olması
  // her olayın iki kez işlenmesine sebep oluyordu.
  
  // ESKİ KODUN TAMAMI ÇIKARILDI
  
  // NOT: Bu eski kod, aşağıdaki useEffect ile çakışıyordu:
  // `useEffect(() => { const containerElement = containerRef.current; ... })`
  
  // ESC tuşuna basıldığında seçimi iptal et ve seçim aracına geç
  // Escape tuşu işlemini memoize ediyoruz - performans için
  // Geri alma (undo) işlemi - Operasyon bazlı geri alma
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
      setSelectedShapeId(null);
      
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
  }, [activeTool, onSelectObject, onToolChange, drawingLine, drawingPolyline, isDraggingEndpoint, handleUndo]);
  
  // Keyboard eventleri için ayrı bir useEffect
  useEffect(() => {
    // Event listener ekle
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]); // Sadece handleKeyDown değiştiğinde bağla
  
  // Özel eventleri dinlemek için ayrı bir useEffect - bu sayede döngüsel bağımlılıkları önlüyoruz
  useEffect(() => {
    if (containerRef.current) {
      const containerElement = containerRef.current;
      
      // Fit View için şekilleri alma olayını dinle
      const getAllShapesHandler = ((e: any) => {
        // Tüm şekilleri al ve callback'e gönder
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
      
      // Artık bu kodları tamamen kaldırıyoruz
      
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
  
  // Araç değiştiğinde seçimi iptal et ve imleci güncelle
  // activeTool değiştikçe çalışacak
  const prevToolRef = useRef(activeTool);
  
  // Çizim durumlarını sıfırlayan yardımcı fonksiyon - daha temiz bir yaklaşım
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
  
  // Tool değişikliğini yakalayan useEffect
  useEffect(() => {
    // Eğer aktiveTool değişmediyse hiçbir şey yapma
    if (prevToolRef.current === activeTool) {
      return;
    }
    
    // Araç değiştiğinde referansı güncelle
    prevToolRef.current = activeTool;
    
    // Seçili şekli temizle
    setSelectedShapeId(null);
    
    // Üst bileşene bildir
    if (onSelectObject) {
      onSelectObject(null);
    }
    
    // Çizim durumlarını sıfırla
    resetDrawingStates();
    
    // İmleç stilini güncelle
    if (canvasRef.current) {
      if (activeTool === 'selection') {
        canvasRef.current.style.cursor = 'grab';
      } else {
        canvasRef.current.style.cursor = 'crosshair';
      }
    }
  }, [activeTool, onSelectObject, resetDrawingStates]);
  
  // Sağ tıklama işlemleri
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

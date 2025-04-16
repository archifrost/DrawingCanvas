import { Point } from '@/types';

// Point primitive
export interface PointShape {
  type: 'point';
  x: number;
  y: number;
  style: 'default' | 'square' | 'cross';
}

export function createPoint(x: number, y: number, style: 'default' | 'square' | 'cross' = 'default'): PointShape {
  return {
    type: 'point',
    x,
    y,
    style
  };
}

// Line primitive
export interface LineShape {
  type: 'line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thickness: number;
}

export function createLine(startX: number, startY: number, endX: number, endY: number, thickness: number = 1): LineShape {
  return {
    type: 'line',
    startX,
    startY,
    endX,
    endY,
    thickness
  };
}

// Rectangle ve circle primitives kaldırıldı

// Polyline primitive
export interface PolylineShape {
  type: 'polyline';
  points: Point[];
  thickness: number;
  closed: boolean; // Kapalı mı (son nokta ilk noktaya bağlanacak mı)
}

export function createPolyline(points: Point[] = [], thickness: number = 1, closed: boolean = false): PolylineShape {
  return {
    type: 'polyline',
    points,
    thickness,
    closed
  };
}

// Text primitive
export interface TextShape {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export function createText(x: number, y: number, text: string, fontSize: number = 12): TextShape {
  return {
    type: 'text',
    x,
    y,
    text,
    fontSize
  };
}

// Calculate distance between two points
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Rectangle fonksiyonu kaldırıldı

// Check if a point is near a line (for selection)
export function pointNearLine(point: Point, line: LineShape, tolerance: number = 10): boolean {
  const lineLength = distance(
    { x: line.startX, y: line.startY }, 
    { x: line.endX, y: line.endY }
  );
  
  if (lineLength === 0) return distance(point, { x: line.startX, y: line.startY }) <= tolerance;
  
  // Calculate the distance from point to line
  const t = (
    (point.x - line.startX) * (line.endX - line.startX) + 
    (point.y - line.startY) * (line.endY - line.startY)
  ) / (lineLength * lineLength);
  
  const clampedT = Math.max(0, Math.min(1, t));
  
  const closestX = line.startX + clampedT * (line.endX - line.startX);
  const closestY = line.startY + clampedT * (line.endY - line.startY);
  
  return distance(point, { x: closestX, y: closestY }) <= tolerance;
}

// Circle fonksiyonu kaldırıldı

// Bir noktanın polyline'a yakın olup olmadığını kontrol eder
export function pointNearPolyline(point: Point, polyline: PolylineShape, tolerance: number = 10): boolean {
  // Polyline'da yeterli nokta yoksa false döndür
  if (polyline.points.length < 2) return false;
  
  // Her bir çizgi segmenti için kontrol et
  for (let i = 0; i < polyline.points.length - 1; i++) {
    const start = polyline.points[i];
    const end = polyline.points[i + 1];
    
    // Geçici bir çizgi nesnesi oluştur
    const lineSegment: LineShape = {
      type: 'line',
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      thickness: polyline.thickness
    };
    
    // Bu segmente yakın mı diye kontrol et
    if (pointNearLine(point, lineSegment, tolerance)) {
      return true;
    }
  }
  
  // Kapalı polyline ise, son nokta ile ilk nokta arasındaki segmenti de kontrol et
  if (polyline.closed && polyline.points.length > 2) {
    const start = polyline.points[polyline.points.length - 1];
    const end = polyline.points[0];
    
    const lineSegment: LineShape = {
      type: 'line',
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      thickness: polyline.thickness
    };
    
    if (pointNearLine(point, lineSegment, tolerance)) {
      return true;
    }
  }
  
  return false;
}

// Çizginin orta noktasını hesaplar
export function getLineMidpoint(line: LineShape): Point {
  return {
    x: (line.startX + line.endX) / 2,
    y: (line.startY + line.endY) / 2
  };
}

// Polyline şeklinin toplam uzunluğunu hesaplar
export function calculatePolylineLength(polyline: PolylineShape): number {
  if (!polyline.points || polyline.points.length < 2) return 0;
  
  let totalLength = 0;
  
  // Tüm segmentleri dolaş ve uzunluklarını topla
  for (let i = 0; i < polyline.points.length - 1; i++) {
    const p1 = polyline.points[i];
    const p2 = polyline.points[i + 1];
    
    // Euclidean mesafeyi hesapla ve toplama ekle
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }
  
  // Kapalı polyline ise son nokta ile ilk nokta arasındaki mesafeyi de ekle
  if (polyline.closed && polyline.points.length > 2) {
    const first = polyline.points[0];
    const last = polyline.points[polyline.points.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }
  
  return totalLength;
}

// Bir doğrunun uzantısında belirli bir noktanın olup olmadığını kontrol eder
export function isPointOnLineExtension(
  point: Point, 
  lineStart: Point, 
  lineEnd: Point, 
  tolerance: number
): Point & { isExtension: boolean, lineStart: Point, lineEnd: Point } | null {
  // Doğru üzerindeki en yakın noktayı bul
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  // Doğrunun uzunluğunun karesi
  const lenSq = dx * dx + dy * dy;
  
  // Doğru bir noktaysa (başlangıç ve bitiş aynı)
  if (lenSq < 0.0001) return null;
  
  // Noktadan doğruya bir projeksiyon yapalım
  const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
  
  // Projeksiyonu doğru üzerindeki bir nokta olarak hesapla
  const projectionPoint = {
    x: lineStart.x + u * dx,
    y: lineStart.y + u * dy,
    isExtension: true, // Bir uzantı noktası olduğunu belirt
    lineStart, // Başlangıç noktasını kaydet - görselleştirmede kullanılacak
    lineEnd // Bitiş noktasını kaydet - görselleştirmede kullanılacak
  };
  
  // Projeksiyonun başlangıç veya bitiş noktasına uzaklığını kontrol et
  const distToPoint = distance(point, projectionPoint);
  
  // Noktadan projeksiyon noktasına olan mesafe tolerans içindeyse
  // VE projeksiyon doğru segmenti dışında olmalı (extensions için)
  if (distToPoint <= tolerance && (u < 0 || u > 1)) {
    return projectionPoint;
  }
  
  return null;
}

// Bir nokta çizginin başlangıç, orta veya bitiş noktasına yakın mı kontrol eder
export function getSnapPoint(point: Point, line: LineShape, tolerance: number = 10): Point | null {
  // Başlangıç noktasını kontrol et
  if (distance(point, { x: line.startX, y: line.startY }) <= tolerance) {
    return { x: line.startX, y: line.startY };
  }
  
  // Bitiş noktasını kontrol et
  if (distance(point, { x: line.endX, y: line.endY }) <= tolerance) {
    return { x: line.endX, y: line.endY };
  }
  
  // Orta noktayı kontrol et
  const midpoint = getLineMidpoint(line);
  if (distance(point, midpoint) <= tolerance) {
    return midpoint;
  }
  
  // Çizgi uzantısı kontrolü
  const extensionPoint = isPointOnLineExtension(
    point,
    { x: line.startX, y: line.startY },
    { x: line.endX, y: line.endY },
    tolerance
  );
  
  if (extensionPoint) {
    return extensionPoint;
  }
  
  return null;
}

// Verilen noktaya en yakın yakalama noktasını bulur (tüm şekilleri kontrol eder)
export function findNearestSnapPoint(
  point: Point, 
  shapes: any[], 
  tolerance: number = 10,
  excludeShapeId?: number // Dışlanacak şeklin ID'si (kendisine snap yapmaması için)
): Point | null {
  // Yakalama noktalarını topla
  const snapPoints: Array<{x: number, y: number, priority: number, dist: number}> = [];
  
  // Tüm şekillerden yakalama noktalarını topla
  for (const shape of shapes) {
    // Eğer bu şekil dışlanacaksa, atla
    if (excludeShapeId !== undefined && shape.id === excludeShapeId) {
      continue;
    }
    
    if (shape.type === 'point') {
      // Nokta şekli
      const dist = distance(point, { x: shape.x, y: shape.y });
      if (dist <= tolerance) {
        snapPoints.push({ 
          x: shape.x, 
          y: shape.y, 
          priority: 3, // Noktalara en yüksek öncelik
          dist: dist 
        });
      }
    } else if (shape.type === 'line') {
      // Çizgi şekli - başlangıç ve bitiş noktaları (yüksek öncelik)
      const startDist = distance(point, { x: shape.startX, y: shape.startY });
      if (startDist <= tolerance) {
        snapPoints.push({ 
          x: shape.startX, 
          y: shape.startY, 
          priority: 3, // Başlangıç/bitiş noktalara yüksek öncelik
          dist: startDist 
        });
      }
      
      const endDist = distance(point, { x: shape.endX, y: shape.endY });
      if (endDist <= tolerance) {
        snapPoints.push({ 
          x: shape.endX, 
          y: shape.endY, 
          priority: 3, // Başlangıç/bitiş noktalara yüksek öncelik
          dist: endDist 
        });
      }
      
      // Orta nokta (orta öncelik)
      const midpoint = getLineMidpoint(shape);
      const midDist = distance(point, midpoint);
      if (midDist <= tolerance) {
        snapPoints.push({ 
          x: midpoint.x, 
          y: midpoint.y, 
          priority: 2, // Orta noktalara orta öncelik
          dist: midDist 
        });
      }
      
      // Çizgi uzantısı kontrolü (düşük öncelik)
      const extensionPoint = isPointOnLineExtension(
        point,
        { x: shape.startX, y: shape.startY },
        { x: shape.endX, y: shape.endY },
        tolerance
      );
      
      if (extensionPoint) {
        const extDist = distance(point, extensionPoint);
        snapPoints.push({ 
          x: extensionPoint.x, 
          y: extensionPoint.y, 
          priority: 1, // Uzantılara düşük öncelik
          dist: extDist 
        });
      }
    } else if (shape.type === 'polyline' && Array.isArray(shape.points)) {
      // Polyline için tüm noktaları kontrol et
      for (let i = 0; i < shape.points.length; i++) {
        const polyPoint = shape.points[i];
        const ptDist = distance(point, polyPoint);
        if (ptDist <= tolerance) {
          snapPoints.push({ 
            x: polyPoint.x, 
            y: polyPoint.y, 
            priority: 3, // Köşe noktalara yüksek öncelik
            dist: ptDist 
          });
        }
        
        // Segment uzantıları ve orta noktalar
        if (i < shape.points.length - 1) {
          const nextPoint = shape.points[i + 1];
          
          // Ardışık noktalar arasındaki orta nokta da yakalanabilir
          const midpoint = {
            x: (polyPoint.x + nextPoint.x) / 2,
            y: (polyPoint.y + nextPoint.y) / 2
          };
          
          const midDist = distance(point, midpoint);
          if (midDist <= tolerance) {
            snapPoints.push({ 
              x: midpoint.x, 
              y: midpoint.y, 
              priority: 2, // Orta noktalara orta öncelik
              dist: midDist 
            });
          }
          
          // Segment uzantısı
          const extensionPoint = isPointOnLineExtension(
            point,
            polyPoint,
            nextPoint,
            tolerance
          );
          
          if (extensionPoint) {
            const extDist = distance(point, extensionPoint);
            snapPoints.push({ 
              x: extensionPoint.x, 
              y: extensionPoint.y, 
              priority: 1, // Uzantılara düşük öncelik
              dist: extDist 
            });
          }
        }
      }
      
      // Eğer kapalı polyline ise, son nokta ile ilk nokta arasındaki segment de kontrol edilir
      if (shape.closed && shape.points.length > 2) {
        const firstPoint = shape.points[0];
        const lastPoint = shape.points[shape.points.length - 1];
        
        // Orta nokta
        const midpoint = {
          x: (firstPoint.x + lastPoint.x) / 2,
          y: (firstPoint.y + lastPoint.y) / 2
        };
        
        const midDist = distance(point, midpoint);
        if (midDist <= tolerance) {
          snapPoints.push({ 
            x: midpoint.x, 
            y: midpoint.y, 
            priority: 2, // Orta noktalara orta öncelik
            dist: midDist 
          });
        }
        
        // Uzantı
        const extensionPoint = isPointOnLineExtension(
          point,
          lastPoint,
          firstPoint,
          tolerance
        );
        
        if (extensionPoint) {
          const extDist = distance(point, extensionPoint);
          snapPoints.push({ 
            x: extensionPoint.x, 
            y: extensionPoint.y, 
            priority: 1, // Uzantılara düşük öncelik
            dist: extDist 
          });
        }
      }
    }
  }
  
  // Eğer hiç snap noktası yoksa null döndür
  if (snapPoints.length === 0) {
    return null;
  }
  
  // Önceliğe göre sırala (yüksek öncelik önce)
  snapPoints.sort((a, b) => {
    // Önce önceliğe göre (büyük öncelik önce)
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    // Aynı öncelikte olanlar arasında, mesafeye göre (küçük mesafe önce)
    return a.dist - b.dist;
  });
  
  // En yüksek öncelikli ve en yakın noktayı döndür
  return { x: snapPoints[0].x, y: snapPoints[0].y };
}

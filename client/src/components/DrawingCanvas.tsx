import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CanvasState, Tool, Point, Shape } from '@/types'; // Shape import edildi
import { screenToWorld, worldToScreen, drawGrid, drawShape } from '@/lib/canvasUtils';
import { pointNearLine, pointNearPolyline, distance, findNearestSnapPoint } from '@/lib/drawingPrimitives';
import { useShapeManager } from '@/hooks/useShapeManager'; // Yeni hook import edildi

interface DrawingCanvasProps {
  canvasState: CanvasState;
  activeTool: Tool;
  onMousePositionChange: (position: Point) => void;
  onPanChange: (x: number, y: number) => void;
  onZoomChange: (zoom: number) => void;
  onCanvasSizeChange: (width: number, height: number) => void;
  onSelectObject?: (object: any) => void;
  onToolChange?: (tool: Tool) => void;
  snapEnabled?: boolean;
  orthoEnabled?: boolean;
  onCanvasStateChange: (state: CanvasState) => void; // Yeni prop eklendi
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
  snapEnabled = true,
  orthoEnabled = false,
  onCanvasStateChange // Yeni prop kullanılıyor
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Shape Manager Hook'u kullanılıyor
  const {
    shapesRef,
    addShape,
    addShapesBatch,
    updateShape,
    deleteShape,
    clearShapes,
    undoAction
  } = useShapeManager([]); // Başlangıç şekilleri boş dizi

  const currentShapeRef = useRef<Shape | null>(null);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const requestRef = useRef<number | null>(null);
  const draggingLineEndpointRef = useRef<'start' | 'end' | 'vertex' | null>(null);
  const originalLineRef = useRef<Shape | null>(null);
  const currentMousePosRef = useRef<Point>({ x: 0, y: 0 });
  const snapPointRef = useRef<Point | null>(null);
  const orthoStartPointRef = useRef<Point | null>(null);
  const drawingLine = useRef<boolean>(false);
  const lineFirstPointRef = useRef<Point | null>(null);
  const drawingPolyline = useRef<boolean>(false);
  const polylinePointsRef = useRef<Point[]>([]);
  const isDraggingEndpoint = useRef<boolean>(false);
  const draggedShapeIdRef = useRef<number | null>(null);
  const vertexIndexRef = useRef<number | null>(null);

  const [selectedShapeId, setSelectedShapeId] = useState<number | null>(null);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx, canvasState);

    shapesRef.current.forEach((shape: Shape) => {
      drawShape(ctx, shape, canvasState, selectedShapeId === shape.id);
    });

    if (currentShapeRef.current) {
      drawShape(ctx, currentShapeRef.current, canvasState, false, true);
    }

    if (snapPointRef.current && snapEnabled) {
      const screenSnap = worldToScreen(snapPointRef.current, canvasState.scale, canvasState.panOffset);
      ctx.fillStyle = 'rgba(255, 0, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(screenSnap.x, screenSnap.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(screenSnap.x, 0);
      ctx.lineTo(screenSnap.x, canvas.height);
      ctx.moveTo(0, screenSnap.y);
      ctx.lineTo(canvas.width, screenSnap.y);
      ctx.stroke();
    }
  }, [canvasState, selectedShapeId, snapEnabled]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mousePosWorld = screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, canvasState.scale, canvasState.panOffset);
    currentMousePosRef.current = mousePosWorld;

    if (snapEnabled && (activeTool === 'line' || activeTool === 'polyline' || isDraggingEndpoint.current)) {
      snapPointRef.current = findNearestSnapPoint(mousePosWorld, shapesRef.current, canvasState.scale, 10 / canvasState.scale);
    } else {
      snapPointRef.current = null;
    }

    let finalPos = snapPointRef.current ?? mousePosWorld;
    if (orthoEnabled && (drawingLine.current || drawingPolyline.current || isDraggingEndpoint.current) && orthoStartPointRef.current) {
      const dx = Math.abs(finalPos.x - orthoStartPointRef.current.x);
      const dy = Math.abs(finalPos.y - orthoStartPointRef.current.y);
      if (dx > dy) {
        finalPos = { x: finalPos.x, y: orthoStartPointRef.current.y };
      } else {
        finalPos = { x: orthoStartPointRef.current.x, y: finalPos.y };
      }
      if (snapEnabled) {
        const orthoSnap = findNearestSnapPoint(finalPos, shapesRef.current, canvasState.scale, 10 / canvasState.scale);
        if (orthoSnap) finalPos = orthoSnap;
      }
    }
    snapPointRef.current = snapEnabled ? finalPos : null;

    if (isPanningRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      onPanChange(canvasState.panOffset.x + dx, canvasState.panOffset.y + dy);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isDraggingEndpoint.current && draggedShapeIdRef.current !== null) {
      const shapeIndex = shapesRef.current.findIndex(s => s.id === draggedShapeIdRef.current);
      if (shapeIndex !== -1) {
        const shape = { ...shapesRef.current[shapeIndex] };
        const pos = finalPos;

        if (shape.type === 'line') {
          if (draggingLineEndpointRef.current === 'start') {
            shape.startX = pos.x;
            shape.startY = pos.y;
          } else if (draggingLineEndpointRef.current === 'end') {
            shape.endX = pos.x;
            shape.endY = pos.y;
          }
        } else if (shape.type === 'polyline' && vertexIndexRef.current !== null) {
          if (vertexIndexRef.current >= 0 && vertexIndexRef.current < shape.points.length) {
            shape.points[vertexIndexRef.current] = pos;
          }
        } else if (shape.type === 'point') {
          shape.x = pos.x;
          shape.y = pos.y;
        }

        shapesRef.current[shapeIndex] = shape;

        if (onSelectObject) {
          onSelectObject(shape);
        }
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'move';
        }
      }
      return;
    }

    if (activeTool === 'line' && drawingLine.current && lineFirstPointRef.current) {
      orthoStartPointRef.current = lineFirstPointRef.current;
      currentShapeRef.current = {
        id: -1,
        type: 'line',
        startX: lineFirstPointRef.current.x,
        startY: lineFirstPointRef.current.y,
        endX: finalPos.x,
        endY: finalPos.y,
        thickness: 1
      };
    } else if (activeTool === 'polyline' && drawingPolyline.current && polylinePointsRef.current.length > 0) {
      orthoStartPointRef.current = polylinePointsRef.current[polylinePointsRef.current.length - 1];
      const previewPoints = [...polylinePointsRef.current, finalPos];
      currentShapeRef.current = {
        id: -1,
        type: 'polyline',
        points: previewPoints,
        thickness: 1,
        closed: false
      };
    } else {
      currentShapeRef.current = null;
      orthoStartPointRef.current = null;
    }

    if (canvasRef.current && !isDraggingEndpoint.current) {
      canvasRef.current.style.cursor = activeTool === 'selection' ? 'default' : 'crosshair';
    }
  }, [
    activeTool, canvasState, onPanChange, snapEnabled, orthoEnabled,
    drawingLine, lineFirstPointRef, drawingPolyline, polylinePointsRef,
    isDraggingEndpoint, draggedShapeIdRef, draggingLineEndpointRef, vertexIndexRef, onSelectObject
  ]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mousePosWorld = screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, canvasState.scale, canvasState.panOffset);
    let finalPos = mousePosWorld;

    if (snapEnabled && (activeTool === 'point' || activeTool === 'line' || activeTool === 'polyline')) {
      const startSnap = findNearestSnapPoint(mousePosWorld, shapesRef.current, canvasState.scale, 10 / canvasState.scale);
      if (startSnap) {
        finalPos = startSnap;
        snapPointRef.current = startSnap;
      } else {
        snapPointRef.current = null;
      }
    } else {
      snapPointRef.current = null;
    }

    if (e.button === 0) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      if (activeTool === 'selection') {
        let endpointHit = false;
        for (let i = shapesRef.current.length - 1; i >= 0; i--) {
          const shape = shapesRef.current[i];
          const hitResult = pointNearPolyline(finalPos, shape, canvasState.scale, 5 / canvasState.scale, true);

          if (hitResult && hitResult.isOnVertex) {
            isDraggingEndpoint.current = true;
            draggedShapeIdRef.current = shape.id;
            originalLineRef.current = { ...shape };
            draggingLineEndpointRef.current = 'vertex';
            vertexIndexRef.current = hitResult.vertexIndex ?? null;
            orthoStartPointRef.current = shape.points[vertexIndexRef.current!];
            endpointHit = true;
            setSelectedShapeId(shape.id);
            if (onSelectObject) onSelectObject(shape);
            if (canvasRef.current) canvasRef.current.style.cursor = 'move';
            break;
          } else if (shape.type === 'line') {
            const startDist = distance(finalPos, { x: shape.startX, y: shape.startY });
            const endDist = distance(finalPos, { x: shape.endX, y: shape.endY });
            const tolerance = 5 / canvasState.scale;

            if (startDist < tolerance) {
              isDraggingEndpoint.current = true;
              draggedShapeIdRef.current = shape.id;
              originalLineRef.current = { ...shape };
              draggingLineEndpointRef.current = 'start';
              vertexIndexRef.current = null;
              orthoStartPointRef.current = { x: shape.endX, y: shape.endY };
              endpointHit = true;
              setSelectedShapeId(shape.id);
              if (onSelectObject) onSelectObject(shape);
              if (canvasRef.current) canvasRef.current.style.cursor = 'move';
              break;
            } else if (endDist < tolerance) {
              isDraggingEndpoint.current = true;
              draggedShapeIdRef.current = shape.id;
              originalLineRef.current = { ...shape };
              draggingLineEndpointRef.current = 'end';
              vertexIndexRef.current = null;
              orthoStartPointRef.current = { x: shape.startX, y: shape.startY };
              endpointHit = true;
              setSelectedShapeId(shape.id);
              if (onSelectObject) onSelectObject(shape);
              if (canvasRef.current) canvasRef.current.style.cursor = 'move';
              break;
            }
          }
        }

        if (!endpointHit) {
          let selected = null;
          for (let i = shapesRef.current.length - 1; i >= 0; i--) {
            const shape = shapesRef.current[i];
            let isNear = false;
            if (shape.type === 'line') {
              isNear = pointNearLine(finalPos, shape, canvasState.scale, 5 / canvasState.scale);
            } else if (shape.type === 'polyline') {
              const polylineHit = pointNearPolyline(finalPos, shape, canvasState.scale, 5 / canvasState.scale);
              isNear = !!polylineHit && polylineHit.isOnLine;
            } else if (shape.type === 'point') {
              isNear = distance(finalPos, shape) < 5 / canvasState.scale;
            }

            if (isNear) {
              selected = shape;
              break;
            }
          }
          setSelectedShapeId(selected ? selected.id : null);
          if (onSelectObject) {
            onSelectObject(selected);
          }
        }
      } else if (activeTool === 'point') {
        const newPointData = {
          type: 'point',
          x: finalPos.x,
          y: finalPos.y,
          style: 'cross'
        };
        addShape(newPointData);
      } else if (activeTool === 'line') {
        if (!drawingLine.current) {
          drawingLine.current = true;
          lineFirstPointRef.current = finalPos;
          orthoStartPointRef.current = finalPos;
        } else {
          drawingLine.current = false;
          orthoStartPointRef.current = null;
          snapPointRef.current = null;
          if (lineFirstPointRef.current) {
            const newLineData = {
              type: 'line',
              startX: lineFirstPointRef.current.x,
              startY: lineFirstPointRef.current.y,
              endX: finalPos.x,
              endY: finalPos.y,
              thickness: 1
            };
            addShape(newLineData);
          }
          lineFirstPointRef.current = null;
          currentShapeRef.current = null;
        }
      } else if (activeTool === 'polyline') {
        if (!drawingPolyline.current) {
          drawingPolyline.current = true;
          polylinePointsRef.current = [finalPos];
          orthoStartPointRef.current = finalPos;
        } else {
          polylinePointsRef.current.push(finalPos);
          orthoStartPointRef.current = finalPos;
        }
      }
    }
  }, [
    activeTool, canvasState, onSelectObject, snapEnabled, orthoEnabled,
    drawingLine, lineFirstPointRef, drawingPolyline, polylinePointsRef, addShape, setSelectedShapeId
  ]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    isPanningRef.current = false;

    if (isDraggingEndpoint.current && draggedShapeIdRef.current !== null && originalLineRef.current) {
      const shapeToUpdate = shapesRef.current.find(s => s.id === draggedShapeIdRef.current);
      if (shapeToUpdate) {
        const updated = updateShape(shapeToUpdate);
        if (updated && onSelectObject) {
          onSelectObject(shapeToUpdate);
        }
      }

      isDraggingEndpoint.current = false;
      draggedShapeIdRef.current = null;
      originalLineRef.current = null;
      draggingLineEndpointRef.current = null;
      vertexIndexRef.current = null;
      orthoStartPointRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = activeTool === 'selection' ? 'default' : 'crosshair';
      }
    }
  }, [activeTool, updateShape, onSelectObject]);

  const handleDoubleClick = useCallback(() => {
    if (activeTool === 'polyline' && drawingPolyline.current && polylinePointsRef.current.length >= 2) {
      const polylineData = {
        type: 'polyline',
        points: [...polylinePointsRef.current],
        thickness: 1,
        closed: false
      };
      addShape(polylineData);

      drawingPolyline.current = false;
      polylinePointsRef.current = [];
      currentShapeRef.current = null;
      orthoStartPointRef.current = null;
      snapPointRef.current = null;
    }
  }, [activeTool, addShape]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (activeTool === 'polyline' && drawingPolyline.current && polylinePointsRef.current.length >= 2) {
      const polylineData = {
        type: 'polyline',
        points: [...polylinePointsRef.current],
        thickness: 1,
        closed: false
      };
      addShape(polylineData);

      drawingPolyline.current = false;
      polylinePointsRef.current = [];
      currentShapeRef.current = null;
      orthoStartPointRef.current = null;
      snapPointRef.current = null;
    } else if (activeTool === 'line' && drawingLine.current) {
      drawingLine.current = false;
      lineFirstPointRef.current = null;
      currentShapeRef.current = null;
      orthoStartPointRef.current = null;
      snapPointRef.current = null;
    } else if (activeTool === 'polyline' && drawingPolyline.current && polylinePointsRef.current.length >= 1) {
      drawingPolyline.current = false;
      polylinePointsRef.current = [];
      currentShapeRef.current = null;
      orthoStartPointRef.current = null;
      snapPointRef.current = null;
    }
  }, [activeTool, addShape, drawingLine, drawingPolyline, canvasState]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const scaleMultiplier = 1.1;
    const mousePosScreen = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    const mousePosWorldBeforeZoom = screenToWorld(mousePosScreen, canvasState.scale, canvasState.panOffset);

    let newScale: number;
    if (e.deltaY < 0) {
      newScale = canvasState.scale * scaleMultiplier;
    } else {
      newScale = canvasState.scale / scaleMultiplier;
    }
    newScale = Math.max(0.1, Math.min(newScale, 20));

    const mousePosWorldAfterZoom = screenToWorld(mousePosScreen, newScale, canvasState.panOffset);

    const newPanOffsetX = canvasState.panOffset.x + (mousePosWorldAfterZoom.x - mousePosWorldBeforeZoom.x) * newScale;
    const newPanOffsetY = canvasState.panOffset.y + (mousePosWorldAfterZoom.y - mousePosWorldBeforeZoom.y) * newScale;

    onCanvasStateChange({ scale: newScale, panOffset: { x: newPanOffsetX, y: newPanOffsetY } });
  }, [canvasState, onCanvasStateChange]);

  const handleUndoCallback = useCallback(() => {
    const success = undoAction(
      restoredShape => {
        if (selectedShapeId === restoredShape.id && onSelectObject) {
          onSelectObject(restoredShape);
        }
      },
      removedShapeId => {
        if (selectedShapeId === removedShapeId) {
          setSelectedShapeId(null);
          if (onSelectObject) onSelectObject(null);
        }
      },
      restoredShapes => {
        setSelectedShapeId(null);
        if (onSelectObject) onSelectObject(null);
      },
      removedShapeIds => {
        if (selectedShapeId && removedShapeIds.includes(selectedShapeId)) {
          setSelectedShapeId(null);
          if (onSelectObject) onSelectObject(null);
        }
      }
    );
    if (success) {
      console.log("Undo successful.");
    }
  }, [undoAction, selectedShapeId, onSelectObject, setSelectedShapeId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      handleUndoCallback();
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId !== null) {
      const deletedShape = deleteShape(selectedShapeId);
      if (deletedShape) {
        setSelectedShapeId(null);
        if (onSelectObject) onSelectObject(null);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (drawingLine.current) {
        drawingLine.current = false;
        lineFirstPointRef.current = null;
        currentShapeRef.current = null;
        orthoStartPointRef.current = null;
        snapPointRef.current = null;
      } else if (drawingPolyline.current) {
        drawingPolyline.current = false;
        polylinePointsRef.current = [];
        currentShapeRef.current = null;
        orthoStartPointRef.current = null;
        snapPointRef.current = null;
      } else if (isDraggingEndpoint.current) {
        if (draggedShapeIdRef.current !== null && originalLineRef.current) {
          const shapeIndex = shapesRef.current.findIndex(s => s.id === draggedShapeIdRef.current);
          if (shapeIndex !== -1) {
            shapesRef.current[shapeIndex] = originalLineRef.current;
            if (selectedShapeId === originalLineRef.current.id && onSelectObject) {
              onSelectObject(originalLineRef.current);
            }
          }
        }
        isDraggingEndpoint.current = false;
        draggedShapeIdRef.current = null;
        originalLineRef.current = null;
        draggingLineEndpointRef.current = null;
        vertexIndexRef.current = null;
        orthoStartPointRef.current = null;
        if (canvasRef.current) {
          canvasRef.current.style.cursor = activeTool === 'selection' ? 'default' : 'crosshair';
        }
      } else {
        setSelectedShapeId(null);
        if (onSelectObject) onSelectObject(null);
        if (activeTool !== 'selection') {
          onToolChange('selection');
        }
      }
    }
  }, [
    activeTool, onSelectObject, onToolChange, drawingLine, drawingPolyline, isDraggingEndpoint,
    handleUndoCallback, selectedShapeId, setSelectedShapeId, deleteShape
  ]);

  useEffect(() => {
    const resizeCanvas = () => {
      if (containerRef.current && canvasRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        onCanvasSizeChange(width, height);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [onCanvasSizeChange]);

  useEffect(() => {
    const handleShapeUpdate = (e: CustomEvent) => {
      if (!e.detail) return;

      if (e.detail.type === 'batch' && Array.isArray(e.detail.shapes)) {
        const shapesToAdd = e.detail.shapes.map((s: any) => {
          const { id, ...rest } = s;
          return rest;
        });
        addShapesBatch(shapesToAdd);
      } else if (e.detail.shape) {
        const shapeData = e.detail.shape;
        if (e.detail.type === 'update') {
          const success = updateShape(shapeData);
          if (!success) {
            console.warn("shapeupdate event: Shape not found for update:", shapeData.id);
          } else if (selectedShapeId === shapeData.id && onSelectObject) {
            onSelectObject(shapeData);
          }
        } else if (e.detail.type === 'add') {
          const { id, ...rest } = shapeData;
          addShape(rest);
        } else if (e.detail.type === 'delete' && shapeData.id) {
          const deleted = deleteShape(shapeData.id);
          if (deleted && selectedShapeId === shapeData.id) {
            setSelectedShapeId(null);
            if (onSelectObject) onSelectObject(null);
          }
        }
      }
    };

    const handleGetAllShapes = (e: CustomEvent) => {
      const detail = { shapes: shapesRef.current };
      const responseEvent = new CustomEvent('allShapesResponse', { detail });
      document.dispatchEvent(responseEvent);
    };

    document.addEventListener('shapeupdate', handleShapeUpdate as EventListener);
    document.addEventListener('getAllShapes', handleGetAllShapes as EventListener);

    return () => {
      document.removeEventListener('shapeupdate', handleShapeUpdate as EventListener);
      document.removeEventListener('getAllShapes', handleGetAllShapes as EventListener);
    };
  }, [addShape, addShapesBatch, updateShape, deleteShape, selectedShapeId, onSelectObject, setSelectedShapeId]);

  useEffect(() => {
    drawingLine.current = false;
    lineFirstPointRef.current = null;
    drawingPolyline.current = false;
    polylinePointsRef.current = [];
    currentShapeRef.current = null;
    isDraggingEndpoint.current = false;
    draggedShapeIdRef.current = null;
    originalLineRef.current = null;
    orthoStartPointRef.current = null;
    snapPointRef.current = null;

    if (canvasRef.current) {
      canvasRef.current.style.cursor = activeTool === 'selection' ? 'default' : 'crosshair';
    }
  }, [activeTool]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    const animate = () => {
      renderCanvas();
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [renderCanvas]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{ display: 'block', background: '#f0f0f0', width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default DrawingCanvas;

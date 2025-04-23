import { useRef, useCallback } from 'react';
import { Shape } from '@/types'; // Import the actual Shape type

// Geri alma işlemi için tip tanımı
interface ActionHistoryEntry {
  action: 'add_shape' | 'update_shape' | 'delete_shape' | 'clear_shapes' | 'batch_add_shapes';
  data: any;
}

export function useShapeManager(initialShapes: Shape[] = []) {
  const shapesRef = useRef<Shape[]>(initialShapes);
  const actionsHistoryRef = useRef<ActionHistoryEntry[]>([]);
  const nextIdRef = useRef<number>(
    initialShapes.length > 0
      ? Math.max(...initialShapes.map(s => s.id)) + 1 // Ensure IDs are numbers
      : 1
  );

  const getNextId = useCallback(() => {
    return nextIdRef.current++;
  }, []);

  const addShape = useCallback((shape: Omit<Shape, 'id'>) => {
    const newShape = { ...shape, id: getNextId() } as Shape;
    shapesRef.current.push(newShape);
    actionsHistoryRef.current.push({
      action: 'add_shape',
      data: { shapeId: newShape.id },
    });
    console.log("Shape added:", newShape); // Debug log
    return newShape; // Eklenen şekli döndür
  }, [getNextId]);

  const addShapesBatch = useCallback((shapes: Omit<Shape, 'id'>[]) => {
    const addedShapeIds: number[] = [];
    shapes.forEach(shape => {
      const newShape = { ...shape, id: getNextId() } as Shape;
      shapesRef.current.push(newShape);
      addedShapeIds.push(newShape.id);
    });
    if (addedShapeIds.length > 0) {
      actionsHistoryRef.current.push({
        action: 'batch_add_shapes',
        data: { shapeIds: addedShapeIds },
      });
    }
    console.log(`Batch added ${addedShapeIds.length} shapes.`); // Debug log
  }, [getNextId]);


  const updateShape = useCallback((updatedShape: Shape) => {
    const shapeIndex = shapesRef.current.findIndex(s => s.id === updatedShape.id);
    if (shapeIndex !== -1) {
      const originalShape = { ...shapesRef.current[shapeIndex] };
      // Check if the shape actually changed before adding to history
      if (JSON.stringify(originalShape) !== JSON.stringify(updatedShape)) {
          actionsHistoryRef.current.push({
            action: 'update_shape',
            data: { originalShape },
          });
          console.log("Shape update added to history:", originalShape); // Debug log
      }
      shapesRef.current[shapeIndex] = updatedShape;
      console.log("Shape updated:", updatedShape); // Debug log
      return true; // Güncelleme başarılı
    }
    console.log("Shape not found for update:", updatedShape.id); // Debug log
    return false; // Şekil bulunamadı
  }, []);

  const deleteShape = useCallback((shapeId: number) => {
    const shapeIndex = shapesRef.current.findIndex(s => s.id === shapeId);
    if (shapeIndex !== -1) {
      const deletedShape = shapesRef.current[shapeIndex];
      actionsHistoryRef.current.push({
        action: 'delete_shape',
        data: { deletedShape },
      });
      shapesRef.current.splice(shapeIndex, 1);
      console.log("Shape deleted:", deletedShape); // Debug log
      return deletedShape; // Silinen şekli döndür
    }
    console.log("Shape not found for delete:", shapeId); // Debug log
    return null; // Şekil bulunamadı
  }, []);

  const clearShapes = useCallback(() => {
    if (shapesRef.current.length > 0) {
       const oldShapes = [...shapesRef.current];
       actionsHistoryRef.current.push({
         action: 'clear_shapes',
         data: { oldShapes },
       });
       shapesRef.current = [];
       console.log("Shapes cleared. Old shapes added to history:", oldShapes); // Debug log
       return oldShapes; // Silinen şekilleri döndür
    }
    console.log("No shapes to clear."); // Debug log
    return [];
  }, []);


  const undoAction = useCallback((
    onShapeRestored?: (shape: Shape) => void,
    onShapeRemoved?: (shapeId: number) => void,
    onMultipleShapesRestored?: (shapes: Shape[]) => void,
    onMultipleShapesRemoved?: (shapeIds: number[]) => void
  ) => {
    if (actionsHistoryRef.current.length === 0) {
      console.log("Undo: No actions in history."); // Debug log
      return false;
    }

    const lastAction = actionsHistoryRef.current.pop();
    if (!lastAction) return false;

    console.log("Undoing action:", lastAction.action, "Data:", lastAction.data); // Debug log

    switch (lastAction.action) {
      case 'add_shape':
        if (lastAction.data?.shapeId) {
          const shapeIndex = shapesRef.current.findIndex(s => s.id === lastAction.data.shapeId);
          if (shapeIndex !== -1) {
            const removedShapeId = shapesRef.current[shapeIndex].id;
            shapesRef.current.splice(shapeIndex, 1);
            console.log("Undo add_shape: Shape removed.", removedShapeId); // Debug log
            if (onShapeRemoved) onShapeRemoved(removedShapeId);
          } else {
             console.log("Undo add_shape: Shape not found.", lastAction.data.shapeId); // Debug log
          }
        }
        break;
      case 'update_shape':
        if (lastAction.data?.originalShape) {
          const shapeIndex = shapesRef.current.findIndex(s => s.id === lastAction.data.originalShape.id);
          if (shapeIndex !== -1) {
            shapesRef.current[shapeIndex] = lastAction.data.originalShape;
            console.log("Undo update_shape: Shape restored.", lastAction.data.originalShape); // Debug log
            if (onShapeRestored) onShapeRestored(lastAction.data.originalShape);
          } else {
            // If shape was deleted in between (shouldn't happen with proper history but let's be safe)
            shapesRef.current.push(lastAction.data.originalShape);
            console.log("Undo update_shape: Shape was missing, re-added.", lastAction.data.originalShape); // Debug log
             if (onShapeRestored) onShapeRestored(lastAction.data.originalShape);
          }
        }
        break;
      case 'delete_shape':
        if (lastAction.data?.deletedShape) {
          shapesRef.current.push(lastAction.data.deletedShape);
          console.log("Undo delete_shape: Shape restored.", lastAction.data.deletedShape); // Debug log
          if (onShapeRestored) onShapeRestored(lastAction.data.deletedShape);
        }
        break;
      case 'clear_shapes':
         if (lastAction.data?.oldShapes) {
           shapesRef.current = [...lastAction.data.oldShapes];
           console.log("Undo clear_shapes: Shapes restored.", lastAction.data.oldShapes); // Debug log
           if (onMultipleShapesRestored) onMultipleShapesRestored(lastAction.data.oldShapes);
         }
         break;
      case 'batch_add_shapes':
         if (lastAction.data?.shapeIds && Array.isArray(lastAction.data.shapeIds)) {
           const removedIds: number[] = [];
           // Iterate backwards to avoid index issues when splicing
           for (let i = shapesRef.current.length - 1; i >= 0; i--) {
               if (lastAction.data.shapeIds.includes(shapesRef.current[i].id)) {
                   removedIds.push(shapesRef.current[i].id);
                   shapesRef.current.splice(i, 1);
               }
           }
           console.log(`Undo batch_add_shapes: ${removedIds.length} shapes removed.`, removedIds); // Debug log
           if (onMultipleShapesRemoved && removedIds.length > 0) {
             onMultipleShapesRemoved(removedIds);
           }
         }
         break;
      default:
        console.log("Undo: Unknown action type:", lastAction.action); // Debug log
        // Push the action back if it's unknown? Or just fail? Let's fail for now.
        // actionsHistoryRef.current.push(lastAction);
        return false; // Geri alma başarısız
    }
    console.log("Undo successful. History length:", actionsHistoryRef.current.length); // Debug log
    return true; // Geri alma başarılı
  }, []);

  return {
    shapesRef, // Direkt erişim için (render döngüsü vb.)
    addShape,
    addShapesBatch,
    updateShape,
    deleteShape,
    clearShapes,
    undoAction,
    getNextId, // Gerekirse ID almak için
    actionsHistoryRef // Gerekirse geçmişe erişim için (debugging vb.)
  };
}
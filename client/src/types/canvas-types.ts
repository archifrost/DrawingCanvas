export type Point = {
  x: number;
  y: number;
};

export type CanvasState = {
  zoom: number;
  panOffset: Point;
  canvasSize: {
    width: number;
    height: number;
  };
};

export type Tool = 'selection' | 'line' | 'polyline' | 'text' | 'point';
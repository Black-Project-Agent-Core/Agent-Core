export interface GraphPoint { x: number; y: number }

export function deterministicScaffoldPosition(index: number): GraphPoint {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return { x: 72 + column * 280, y: 72 + row * 180 };
}

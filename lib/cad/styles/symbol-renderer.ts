// lib/cad/styles/symbol-renderer.ts — Render symbols using PixiJS Graphics
import type { SymbolDefinition } from './types';

/** Parse color: '#RRGGBB' → number for PixiJS */
export function parseColor(hex: string): number {
  if (!hex || typeof hex !== 'string') return 0x000000;
  const clean = hex.replace('#', '');
  const parsed = parseInt(clean, 16);
  return isNaN(parsed) ? 0x000000 : parsed;
}

function resolvePathColor(
  pathColor: string | 'INHERIT' | 'NONE',
  inheritColor: number,
): number | null {
  if (pathColor === 'NONE') return null;
  if (pathColor === 'INHERIT') return inheritColor;
  return parseColor(pathColor as string);
}

interface PathCommand {
  type: 'M' | 'L' | 'C' | 'Z';
  x: number; y: number;
  x1?: number; y1?: number;
  x2?: number; y2?: number;
}

/**
 * Parse a minimal subset of SVG path data used by CAD symbols.
 * Supported commands: M, L, C, Z, H (horizontal line), V (vertical line).
 * Unknown commands are silently skipped so custom symbols never crash the renderer.
 */
export function parseSVGPathData(d: string): PathCommand[] {
  if (!d) return [];
  const commands: PathCommand[] = [];
  // Extend regex to also capture H and V commands
  const regex = /([MLCZHV])\s*([^MLCZHV]*)/gi;
  let match: RegExpExecArray | null;
  let curX = 0, curY = 0;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1].toUpperCase();
    const nums = match[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

    switch (type) {
      case 'M':
      case 'L':
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const cmd: PathCommand = { type: (i === 0 ? type : 'L') as 'M' | 'L', x: nums[i], y: nums[i + 1] };
          commands.push(cmd);
          curX = nums[i];
          curY = nums[i + 1];
        }
        break;
      case 'H':
        // Horizontal line: only x provided; y stays same
        for (const x of nums) {
          commands.push({ type: 'L', x, y: curY });
          curX = x;
        }
        break;
      case 'V':
        // Vertical line: only y provided; x stays same
        for (const y of nums) {
          commands.push({ type: 'L', x: curX, y });
          curY = y;
        }
        break;
      case 'C':
        for (let i = 0; i + 5 < nums.length; i += 6) {
          commands.push({ type: 'C', x1: nums[i], y1: nums[i + 1], x2: nums[i + 2], y2: nums[i + 3], x: nums[i + 4], y: nums[i + 5] });
          curX = nums[i + 4];
          curY = nums[i + 5];
        }
        break;
      case 'Z':
        commands.push({ type: 'Z', x: 0, y: 0 });
        break;
      // Unknown commands (A, S, Q, T, etc.) are silently ignored — ensures
      // malformed custom symbols never crash the renderer.
    }
  }
  return commands;
}

/**
 * Render a symbol to a PixiJS Graphics object.
 * @param g - PixiJS Graphics instance
 * @param symbol - Symbol definition
 * @param screenX - Screen X position
 * @param screenY - Screen Y position
 * @param sizePx - Symbol size in screen pixels
 * @param rotation - Rotation in degrees
 * @param color - Color as hex number (0xFF0000)
 * @param opacity - Opacity 0-1
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderSymbol(
  g: any,
  symbol: SymbolDefinition,
  screenX: number,
  screenY: number,
  sizePx: number,
  rotation: number,
  color: number,
  opacity: number,
): void {
  // Guard against invalid input that could corrupt PixiJS state
  if (!g || !symbol) return;
  if (!Array.isArray(symbol.paths) || symbol.paths.length === 0) return;
  if (!isFinite(screenX) || !isFinite(screenY)) return;
  if (!isFinite(sizePx) || sizePx <= 0) return;

  const scale = sizePx / 10;
  const safeRotation = isFinite(rotation) ? rotation : 0;
  const safeOpacity = Math.max(0, Math.min(1, isFinite(opacity) ? opacity : 1));
  const rad = (safeRotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (const path of symbol.paths) {
    if (path.type === 'TEXT') continue; // TEXT handled separately by PIXI.Text

    const fillColor = resolvePathColor(path.fill, color);
    const strokeColor = resolvePathColor(path.stroke, color);

    if (strokeColor !== null) {
      g.lineStyle(Math.max(0, path.strokeWidth * scale), strokeColor, safeOpacity);
    } else {
      g.lineStyle(0);
    }

    if (fillColor !== null) {
      g.beginFill(fillColor, safeOpacity);
    }

    // Apply manual transform (translate + rotate + scale)
    const tx = (lx: number, ly: number) => {
      const rx = lx * scale;
      const ry = ly * scale;
      return {
        x: screenX + rx * cos - ry * sin,
        y: screenY + rx * sin + ry * cos,
      };
    };

    switch (path.type) {
      case 'CIRCLE': {
        const center = tx(path.cx ?? 0, path.cy ?? 0);
        const rScaled = (path.r ?? 1) * scale;
        if (rScaled > 0) g.drawCircle(center.x, center.y, rScaled);
        break;
      }
      case 'RECT': {
        const x = path.x ?? 0, y = path.y ?? 0;
        const w = path.width ?? 0, h = path.height ?? 0;
        if (w === 0 || h === 0) break;
        const p1 = tx(x, y);
        const p2 = tx(x + w, y);
        const p3 = tx(x + w, y + h);
        const p4 = tx(x, y + h);
        g.moveTo(p1.x, p1.y);
        g.lineTo(p2.x, p2.y);
        g.lineTo(p3.x, p3.y);
        g.lineTo(p4.x, p4.y);
        g.lineTo(p1.x, p1.y);
        break;
      }
      case 'PATH': {
        if (!path.d) break;
        const commands = parseSVGPathData(path.d);
        for (const cmd of commands) {
          switch (cmd.type) {
            case 'M': { const p = tx(cmd.x, cmd.y); g.moveTo(p.x, p.y); break; }
            case 'L': { const p = tx(cmd.x, cmd.y); g.lineTo(p.x, p.y); break; }
            case 'C': {
              const c1 = tx(cmd.x1!, cmd.y1!);
              const c2 = tx(cmd.x2!, cmd.y2!);
              const p = tx(cmd.x, cmd.y);
              g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
              break;
            }
            case 'Z': break;
          }
        }
        break;
      }
    }

    if (fillColor !== null) {
      g.endFill();
    }
  }
}

/**
 * Compute the effective color for a symbol.
 * Takes into account the symbol's colorMode and the code color.
 */
export function resolveSymbolColor(
  symbol: SymbolDefinition,
  codeColor: string,
  layerColor: string,
): string {
  switch (symbol.colorMode) {
    case 'FIXED': return symbol.fixedColor ?? '#000000';
    case 'CODE': return codeColor;
    case 'LAYER': return layerColor;
    default: return codeColor;
  }
}

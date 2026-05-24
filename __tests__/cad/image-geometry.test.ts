import { describe, it, expect } from 'vitest';
import {
  imageCenter,
  imageCorners,
  worldToImageLocal,
  imageLocalToWorld,
  setImageRotationAroundCenter,
  normalizeDeg,
} from '@/lib/cad/geometry/image';
import { transformFeature, rotate } from '@/lib/cad/geometry/transform';
import type { Feature, ImageGeometry } from '@/lib/cad/types';

const baseImg = (over: Partial<ImageGeometry> = {}): ImageGeometry => ({
  imageId: 'img1',
  position: { x: 10, y: 20 },
  width: 8,
  height: 4,
  rotation: 0,
  mirrorX: false,
  mirrorY: false,
  ...over,
});

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('image geometry helpers', () => {
  it('center of an unrotated image is at the box middle', () => {
    const c = imageCenter(baseImg());
    expect(close(c.x, 14)).toBe(true);
    expect(close(c.y, 22)).toBe(true);
  });

  it('corners of an unrotated image are axis-aligned', () => {
    const { bl, br, tr, tl } = imageCorners(baseImg());
    expect([bl.x, bl.y]).toEqual([10, 20]);
    expect([br.x, br.y]).toEqual([18, 20]);
    expect([tr.x, tr.y]).toEqual([18, 24]);
    expect([tl.x, tl.y]).toEqual([10, 24]);
  });

  it('rotating 90° about the center keeps the center fixed', () => {
    const img = baseImg();
    const c0 = imageCenter(img);
    const rot = setImageRotationAroundCenter(img, Math.PI / 2);
    const c1 = imageCenter(rot);
    expect(close(c1.x, c0.x)).toBe(true);
    expect(close(c1.y, c0.y)).toBe(true);
    expect(close(rot.rotation, Math.PI / 2)).toBe(true);
    // width/height are preserved (no AABB growth / stretching)
    expect(rot.width).toBe(8);
    expect(rot.height).toBe(4);
  });

  it('world↔local round-trips for a rotated image', () => {
    const img = setImageRotationAroundCenter(baseImg(), 0.7);
    const p = { x: 3.2, y: -5.1 };
    const back = imageLocalToWorld(img, worldToImageLocal(img, p));
    expect(close(back.x, p.x)).toBe(true);
    expect(close(back.y, p.y)).toBe(true);
  });

  it('local frame puts BL at origin and TR at (w,h)', () => {
    const img = setImageRotationAroundCenter(baseImg(), 1.1);
    const { bl, tr } = imageCorners(img);
    const blLocal = worldToImageLocal(img, bl);
    const trLocal = worldToImageLocal(img, tr);
    expect(close(blLocal.x, 0)).toBe(true);
    expect(close(blLocal.y, 0)).toBe(true);
    expect(close(trLocal.x, 8)).toBe(true);
    expect(close(trLocal.y, 4)).toBe(true);
  });

  it('normalizeDeg wraps into (-180, 180]', () => {
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-190)).toBe(170);
    expect(normalizeDeg(180)).toBe(180);
    expect(normalizeDeg(540)).toBe(180);
  });
});

describe('transformFeature on IMAGE (no stretch / no double-count)', () => {
  const feat = (image: ImageGeometry): Feature => ({
    id: 'f1',
    type: 'IMAGE',
    geometry: { type: 'IMAGE', image },
    layerId: 'L',
    style: {} as Feature['style'],
    properties: {},
  });

  it('pure rotation adds to rotation and preserves size + center', () => {
    const img = baseImg();
    const c0 = imageCenter(img);
    const pivot = { x: 0, y: 0 };
    const out = transformFeature(feat(img), (p) => rotate(p, pivot, Math.PI / 2));
    const oi = out.geometry.image!;
    expect(close(oi.width, 8)).toBe(true);
    expect(close(oi.height, 4)).toBe(true);
    expect(close(oi.rotation, Math.PI / 2)).toBe(true);
    // center should have rotated about the pivot
    const c1 = imageCenter(oi);
    const expected = rotate(c0, pivot, Math.PI / 2);
    expect(close(c1.x, expected.x, 1e-6)).toBe(true);
    expect(close(c1.y, expected.y, 1e-6)).toBe(true);
  });

  it('uniform scale scales size but not rotation', () => {
    const img = setImageRotationAroundCenter(baseImg(), 0.5);
    const out = transformFeature(feat(img), (p) => ({ x: p.x * 2, y: p.y * 2 }));
    const oi = out.geometry.image!;
    expect(close(oi.width, 16, 1e-6)).toBe(true);
    expect(close(oi.height, 8, 1e-6)).toBe(true);
    expect(close(oi.rotation, 0.5, 1e-6)).toBe(true);
  });

  it('translation moves position but keeps size + rotation', () => {
    const img = setImageRotationAroundCenter(baseImg(), 0.3);
    const out = transformFeature(feat(img), (p) => ({ x: p.x + 5, y: p.y - 7 }));
    const oi = out.geometry.image!;
    expect(close(oi.width, 8, 1e-6)).toBe(true);
    expect(close(oi.height, 4, 1e-6)).toBe(true);
    expect(close(oi.rotation, 0.3, 1e-6)).toBe(true);
    const c0 = imageCenter(img);
    const c1 = imageCenter(oi);
    expect(close(c1.x, c0.x + 5, 1e-6)).toBe(true);
    expect(close(c1.y, c0.y - 7, 1e-6)).toBe(true);
  });
});

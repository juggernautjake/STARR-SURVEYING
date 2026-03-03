'use client';
// lib/cad/store/point-store.ts — Store for all survey points and line strings
import { create } from 'zustand';
import type { SurveyPoint, LineString, PointGroup } from '../types';
import type { ImportResult } from '../import/import-pipeline';

interface PointStore {
  // State
  points: Record<string, SurveyPoint>;
  lineStrings: Record<string, LineString>;
  pointGroups: Map<number, PointGroup>;
  showAllGroupPositions: boolean;

  // Actions
  importPoints: (result: ImportResult) => void;
  addPoint: (point: SurveyPoint) => void;
  removePoint: (pointId: string) => void;
  updatePoint: (pointId: string, updates: Partial<SurveyPoint>) => void;
  clearAllPoints: () => void;

  // Queries
  getPoint: (id: string) => SurveyPoint | undefined;
  getPointByNumber: (num: number) => SurveyPoint | undefined;
  getPointsByCode: (baseCode: string) => SurveyPoint[];
  getPointsByLayer: (layerId: string) => SurveyPoint[];
  getPointGroup: (baseNumber: number) => PointGroup | undefined;
  getAllPoints: () => SurveyPoint[];
  getLineString: (id: string) => LineString | undefined;
  getAllLineStrings: () => LineString[];
  getPointCount: () => number;
  getSortedPoints: (sortBy: PointSortField, direction: 'asc' | 'desc', filter?: string) => SurveyPoint[];

  // Toggle
  setShowAllGroupPositions: (show: boolean) => void;
}

export type PointSortField = 'pointNumber' | 'pointName' | 'northing' | 'easting' | 'elevation' | 'resolvedAlphaCode' | 'resolvedNumericCode' | 'monumentAction';

export const usePointStore = create<PointStore>((set, get) => ({
  points: {},
  lineStrings: {},
  pointGroups: new Map(),
  showAllGroupPositions: false,

  importPoints: (result) =>
    set(() => {
      const points: Record<string, SurveyPoint> = {};
      const lineStrings: Record<string, LineString> = {};
      for (const pt of result.points) points[pt.id] = pt;
      for (const ls of result.lineStrings) lineStrings[ls.id] = ls;
      return { points, lineStrings, pointGroups: result.pointGroups };
    }),

  addPoint: (point) =>
    set((state) => ({ points: { ...state.points, [point.id]: point } })),

  removePoint: (pointId) =>
    set((state) => {
      const next = { ...state.points };
      delete next[pointId];
      return { points: next };
    }),

  updatePoint: (pointId, updates) =>
    set((state) => ({
      points: {
        ...state.points,
        [pointId]: { ...state.points[pointId], ...updates },
      },
    })),

  clearAllPoints: () =>
    set({ points: {}, lineStrings: {}, pointGroups: new Map() }),

  getPoint: (id) => get().points[id],

  getPointByNumber: (num) =>
    Object.values(get().points).find(p => p.pointNumber === num),

  getPointsByCode: (baseCode) =>
    Object.values(get().points).filter(p => p.parsedCode.baseCode === baseCode),

  getPointsByLayer: (layerId) =>
    Object.values(get().points).filter(p => p.layerId === layerId),

  getPointGroup: (baseNumber) => get().pointGroups.get(baseNumber),

  getAllPoints: () => Object.values(get().points),

  getLineString: (id) => get().lineStrings[id],

  getAllLineStrings: () => Object.values(get().lineStrings),

  getPointCount: () => Object.keys(get().points).length,

  getSortedPoints: (sortBy, direction, filter) => {
    let pts = Object.values(get().points);

    if (filter) {
      const q = filter.toLowerCase();
      pts = pts.filter(p =>
        p.pointName.toLowerCase().includes(q) ||
        p.resolvedAlphaCode.toLowerCase().includes(q) ||
        p.resolvedNumericCode.includes(q) ||
        p.description.toLowerCase().includes(q) ||
        String(p.pointNumber).includes(q),
      );
    }

    pts.sort((a, b) => {
      let aVal: string | number = (a[sortBy as keyof SurveyPoint] as string | number) ?? '';
      let bVal: string | number = (b[sortBy as keyof SurveyPoint] as string | number) ?? '';
      // Null-safe comparison
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return direction === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    return pts;
  },

  setShowAllGroupPositions: (show) => set({ showAllGroupPositions: show }),
}));

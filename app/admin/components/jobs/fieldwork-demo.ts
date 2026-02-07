// app/admin/components/jobs/fieldwork-demo.ts — Demo survey data generator for FieldWorkView

import type { FieldPoint } from './fieldwork-types';

export function generateDemoSurvey(): FieldPoint[] {
  const pts: FieldPoint[] = [];
  const baseN = 10234567.0;
  const baseE = 3456789.0;
  const baseElev = 485.0;
  // Session 1: Morning — boundary traverse with GPS
  const session1Start = new Date('2026-02-06T08:15:00');
  const boundaryPts = [
    { name: 'CP-1', code: 'CP', desc: 'Control point - brass cap in concrete', dn: 0, de: 0, dEl: 0 },
    { name: 'CP-2', code: 'CP', desc: 'Control point - PK nail in curb', dn: 250.5, de: 180.3, dEl: 1.2 },
    { name: 'BND-1', code: 'IP', desc: 'Iron pin found - 1/2" rebar w/ cap', dn: 45.2, de: 30.1, dEl: 0.3 },
    { name: 'BND-2', code: 'IP', desc: 'Iron pin found - 5/8" rebar', dn: 120.8, de: 25.4, dEl: -0.8 },
    { name: 'BND-3', code: 'FND', desc: 'Found monument - TxDOT disk', dn: 185.3, de: 95.7, dEl: 2.1 },
    { name: 'BND-4', code: 'IP', desc: 'Iron pin set - 1/2" rebar w/ Starr cap', dn: 200.1, de: 210.5, dEl: 3.5 },
    { name: 'BND-5', code: 'IP', desc: 'Iron pin found - bent, disturbed', dn: 150.6, de: 275.2, dEl: 2.8 },
    { name: 'BND-6', code: 'FND', desc: 'Found fence corner post', dn: 80.4, de: 260.9, dEl: 1.9 },
    { name: 'BND-7', code: 'IP', desc: 'Iron pin set - 1/2" rebar w/ Starr cap', dn: 15.3, de: 190.8, dEl: 0.5 },
    { name: 'FNC-1', code: 'FNC', desc: 'Fence corner - T-post', dn: 82.1, de: 262.4, dEl: 1.95 },
    { name: 'FNC-2', code: 'FNC', desc: 'Fence line point', dn: 140.5, de: 268.0, dEl: 2.5 },
    { name: 'TREE-1', code: 'TREE', desc: 'Large oak tree - 24" DBH', dn: 100.2, de: 150.3, dEl: 1.1 },
    { name: 'UTIL-1', code: 'UTIL', desc: 'Electric meter on pole', dn: 60.8, de: 40.2, dEl: 0.6 },
    { name: 'UTIL-2', code: 'UTIL', desc: 'Water meter box', dn: 35.7, de: 55.1, dEl: 0.2 },
  ];

  boundaryPts.forEach((p, i) => {
    const t = new Date(session1Start.getTime() + i * 120000 + Math.random() * 30000);
    const rtks: Array<'fixed' | 'float'> = ['fixed', 'fixed', 'fixed', 'fixed', 'float'];
    const rtkStatus = rtks[Math.floor(Math.random() * rtks.length)];
    const accuracy = rtkStatus === 'fixed' ? 0.008 + Math.random() * 0.015 : 0.04 + Math.random() * 0.03;
    pts.push({
      id: `demo-s1-${i}`,
      data_type: i < 2 ? 'gps_position' : 'point',
      point_name: p.name,
      northing: baseN + p.dn,
      easting: baseE + p.de,
      elevation: baseElev + p.dEl,
      description: p.desc,
      raw_data: {
        code: p.code,
        rtk_status: rtkStatus,
        accuracy,
        pdop: 1.2 + Math.random() * 0.8,
        hdop: 0.7 + Math.random() * 0.5,
        vdop: 0.9 + Math.random() * 0.6,
        satellites: 14 + Math.floor(Math.random() * 8),
        notes: i === 4 ? 'TxDOT marker in good condition' : i === 6 ? 'Pin disturbed - may need to reset' : undefined,
      },
      collected_by: 'jake@starr-surveying.com',
      collected_at: t.toISOString(),
      instrument: 'Trimble R12i',
    });
  });

  // Session 2: Afternoon — total station detail shots (45 min gap = new session)
  const session2Start = new Date(session1Start.getTime() + 14 * 120000 + 50 * 60 * 1000);
  const detailPts = [
    { name: 'BLDG-1', code: 'BLDG', desc: 'Building corner - NW', dn: 90.0, de: 80.0, dEl: 0.8 },
    { name: 'BLDG-2', code: 'BLDG', desc: 'Building corner - NE', dn: 90.0, de: 130.0, dEl: 0.9 },
    { name: 'BLDG-3', code: 'BLDG', desc: 'Building corner - SE', dn: 55.0, de: 130.0, dEl: 0.7 },
    { name: 'BLDG-4', code: 'BLDG', desc: 'Building corner - SW', dn: 55.0, de: 80.0, dEl: 0.75 },
    { name: 'DW-1', code: 'DW', desc: 'Driveway edge - left', dn: 20.0, de: 95.0, dEl: 0.15 },
    { name: 'DW-2', code: 'DW', desc: 'Driveway edge - right', dn: 20.0, de: 115.0, dEl: 0.18 },
    { name: 'DW-3', code: 'DW', desc: 'Driveway at sidewalk', dn: 5.0, de: 105.0, dEl: 0.0 },
    { name: 'CL-1', code: 'CL', desc: 'Centerline road - begin', dn: -5.0, de: 50.0, dEl: -0.3 },
    { name: 'CL-2', code: 'CL', desc: 'Centerline road - mid', dn: -5.0, de: 150.0, dEl: -0.1 },
    { name: 'CL-3', code: 'CL', desc: 'Centerline road - end', dn: -5.0, de: 250.0, dEl: 0.2 },
    { name: 'TOPO-1', code: 'GS', desc: 'Ground shot - yard high point', dn: 110.0, de: 140.0, dEl: 1.5 },
    { name: 'TOPO-2', code: 'GS', desc: 'Ground shot - drainage swale', dn: 130.0, de: 180.0, dEl: -0.5 },
    { name: 'TOPO-3', code: 'GS', desc: 'Ground shot - low area', dn: 160.0, de: 200.0, dEl: -1.2 },
    { name: 'MH-1', code: 'MH', desc: 'Manhole - sanitary sewer', dn: 40.0, de: 160.0, dEl: 0.1 },
    { name: 'FH-1', code: 'FH', desc: 'Fire hydrant', dn: 10.0, de: 180.0, dEl: 0.05 },
  ];

  detailPts.forEach((p, i) => {
    const t = new Date(session2Start.getTime() + i * 90000 + Math.random() * 20000);
    const hzAngle = (45 + i * 22.5 + Math.random() * 2) % 360;
    pts.push({
      id: `demo-s2-${i}`,
      data_type: 'total_station',
      point_name: p.name,
      northing: baseN + p.dn,
      easting: baseE + p.de,
      elevation: baseElev + p.dEl,
      description: p.desc,
      raw_data: {
        code: p.code,
        accuracy: 0.003 + Math.random() * 0.005,
        hz_angle: hzAngle,
        vt_angle: 85 + Math.random() * 10,
        slope_dist: 20 + Math.random() * 150,
        notes: i === 13 ? 'Rim elev: 486.22, Inv IN: 481.50, Inv OUT: 481.30' : undefined,
      },
      collected_by: 'mike@starr-surveying.com',
      collected_at: t.toISOString(),
      instrument: 'Trimble S7',
    });
  });

  // Session 3: Next day morning (large gap)
  const session3Start = new Date('2026-02-07T07:45:00');
  const day2Pts = [
    { name: 'BND-8', code: 'IP', desc: 'Iron pin set - closing corner', dn: 5.0, de: 100.0, dEl: 0.1 },
    { name: 'EAS-1', code: 'EAS', desc: 'Easement line - begin', dn: 170.0, de: 50.0, dEl: 1.8 },
    { name: 'EAS-2', code: 'EAS', desc: 'Easement line - end', dn: 170.0, de: 200.0, dEl: 2.0 },
    { name: 'SIGN-1', code: 'SIGN', desc: 'Street sign - Elm St', dn: -8.0, de: 40.0, dEl: -0.4 },
    { name: 'PP-1', code: 'PP', desc: 'Power pole #47823', dn: 5.5, de: 230.0, dEl: 0.3 },
    { name: 'NOTE-1', code: 'NOTE', desc: 'Neighbor claims fence is on their side', dn: 82.0, de: 263.0, dEl: 1.95 },
  ];

  day2Pts.forEach((p, i) => {
    const t = new Date(session3Start.getTime() + i * 150000 + Math.random() * 30000);
    pts.push({
      id: `demo-s3-${i}`,
      data_type: i === 5 ? 'note' : 'gps_position',
      point_name: p.name,
      northing: baseN + p.dn,
      easting: baseE + p.de,
      elevation: baseElev + p.dEl,
      description: p.desc,
      raw_data: {
        code: p.code,
        rtk_status: 'fixed',
        accuracy: 0.006 + Math.random() * 0.012,
        pdop: 1.0 + Math.random() * 0.5,
        hdop: 0.6 + Math.random() * 0.3,
        vdop: 0.8 + Math.random() * 0.4,
        satellites: 18 + Math.floor(Math.random() * 6),
        notes: i === 5 ? 'Neighbor John Smith at 123 Elm St claims fence was moved in 2019' : undefined,
      },
      collected_by: 'jake@starr-surveying.com',
      collected_at: t.toISOString(),
      instrument: 'Trimble R12i',
    });
  });

  return pts;
}

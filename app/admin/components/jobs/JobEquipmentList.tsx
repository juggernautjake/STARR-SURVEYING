// app/admin/components/jobs/JobEquipmentList.tsx — Equipment tracking
'use client';
import { useState } from 'react';

interface Equipment {
  id: string;
  equipment_name: string;
  equipment_type?: string;
  serial_number?: string;
  checked_out_at?: string;
  returned_at?: string;
  checked_out_by?: string;
  notes?: string;
}

const EQUIPMENT_TYPES: Record<string, { label: string; icon: string }> = {
  total_station: { label: 'Total Station', icon: '🔭' },
  gps_receiver: { label: 'GPS Receiver', icon: '📡' },
  gps_base: { label: 'GPS Base Station', icon: '📡' },
  gps_rover: { label: 'GPS Rover', icon: '📡' },
  level: { label: 'Level', icon: '📏' },
  rod: { label: 'Rod', icon: '📏' },
  tripod: { label: 'Tripod', icon: '🔺' },
  drone: { label: 'Drone', icon: '🚁' },
  data_collector: { label: 'Data Collector', icon: '📱' },
  tablet: { label: 'Tablet', icon: '📱' },
  vehicle: { label: 'Vehicle', icon: '🚗' },
  other: { label: 'Other', icon: '🔧' },
};

interface Props {
  equipment: Equipment[];
  onAdd?: (name: string, type: string, serial: string) => void;
  onReturn?: (id: string) => void;
  editable?: boolean;
}

export default function JobEquipmentList({ equipment, onAdd, onReturn, editable }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('total_station');
  const [serial, setSerial] = useState('');

  function handleAdd() {
    if (!name) return;
    onAdd?.(name, type, serial);
    setName('');
    setSerial('');
    setShowAdd(false);
  }

  const active = equipment.filter(e => !e.returned_at);
  const returned = equipment.filter(e => e.returned_at);

  return (
    <div className="job-equipment">
      <div className="job-equipment__header">
        <h3 className="job-equipment__title">Equipment</h3>
        <span className="job-equipment__count">
          {active.length} active{returned.length > 0 ? `, ${returned.length} returned` : ''}
        </span>
        {editable && (
          <button className="job-equipment__add-btn" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="job-equipment__add-form">
          <input
            className="job-equipment__input"
            placeholder="Equipment name (e.g., Trimble S7)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <select
            className="job-equipment__select"
            value={type}
            onChange={e => setType(e.target.value)}
          >
            {Object.entries(EQUIPMENT_TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            className="job-equipment__input"
            placeholder="Serial number (optional)"
            value={serial}
            onChange={e => setSerial(e.target.value)}
          />
          <button className="job-equipment__submit-btn" onClick={handleAdd}>Add Equipment</button>
        </div>
      )}

      {equipment.length === 0 ? (
        <div className="job-equipment__empty">No equipment assigned</div>
      ) : (
        <div className="job-equipment__list">
          {active.map(item => {
            const typeInfo = EQUIPMENT_TYPES[item.equipment_type || 'other'] || EQUIPMENT_TYPES.other;
            return (
              <div key={item.id} className="job-equipment__item">
                <span className="job-equipment__item-icon">{typeInfo.icon}</span>
                <div className="job-equipment__item-info">
                  <span className="job-equipment__item-name">{item.equipment_name}</span>
                  <span className="job-equipment__item-meta">
                    {typeInfo.label}
                    {item.serial_number && ` · S/N: ${item.serial_number}`}
                    {item.checked_out_at && ` · Out: ${new Date(item.checked_out_at).toLocaleDateString()}`}
                  </span>
                </div>
                {editable && onReturn && (
                  <button className="job-equipment__return-btn" onClick={() => onReturn(item.id)}>
                    Return
                  </button>
                )}
              </div>
            );
          })}
          {returned.length > 0 && (
            <>
              <div className="job-equipment__divider">Returned</div>
              {returned.map(item => {
                const typeInfo = EQUIPMENT_TYPES[item.equipment_type || 'other'] || EQUIPMENT_TYPES.other;
                return (
                  <div key={item.id} className="job-equipment__item job-equipment__item--returned">
                    <span className="job-equipment__item-icon">{typeInfo.icon}</span>
                    <div className="job-equipment__item-info">
                      <span className="job-equipment__item-name">{item.equipment_name}</span>
                      <span className="job-equipment__item-meta">
                        Returned {new Date(item.returned_at!).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { EQUIPMENT_TYPES };

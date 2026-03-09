'use client';
// app/admin/cad/components/CertificationEditor.tsx — Surveyor certification block editor

import { useTemplateStore } from '@/lib/cad/store/template-store';

export default function CertificationEditor() {
  const store = useTemplateStore();
  const cert = store.activeTemplate.certification;

  function update(patch: Partial<typeof cert>) {
    store.updateActiveTemplate({ certification: { ...cert, ...patch } });
  }

  const labelClass = 'block text-xs text-gray-400 mb-0.5';
  const inputClass =
    'w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500';
  const checkClass = 'flex items-center gap-2 cursor-pointer';

  return (
    <div className="flex flex-col h-full bg-gray-800 text-white text-sm select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 font-semibold text-xs uppercase tracking-wide text-gray-400">
        Certification Block
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Surveyor name */}
        <div>
          <label className={labelClass}>Surveyor Name</label>
          <input
            type="text"
            value={cert.surveyorName}
            onChange={(e) => update({ surveyorName: e.target.value })}
            placeholder="John Doe"
            className={inputClass}
          />
        </div>

        {/* License number */}
        <div>
          <label className={labelClass}>License Number</label>
          <input
            type="text"
            value={cert.licenseNumber}
            onChange={(e) => update({ licenseNumber: e.target.value })}
            placeholder="RPLS #0000"
            className={inputClass}
          />
        </div>

        {/* License state */}
        <div>
          <label className={labelClass}>License State</label>
          <input
            type="text"
            value={cert.licenseState}
            onChange={(e) => update({ licenseState: e.target.value })}
            placeholder="Texas"
            className={inputClass}
          />
        </div>

        {/* Firm name */}
        <div>
          <label className={labelClass}>Firm Name</label>
          <input
            type="text"
            value={cert.firmName}
            onChange={(e) => update({ firmName: e.target.value })}
            placeholder="Starr Surveying Company"
            className={inputClass}
          />
        </div>

        {/* Certification text */}
        <div>
          <label className={labelClass}>Certification Text</label>
          <textarea
            value={cert.certificationText}
            onChange={(e) => update({ certificationText: e.target.value })}
            rows={6}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Seal diameter */}
        <div>
          <label className={labelClass}>Seal Diameter (inches)</label>
          <input
            type="number"
            min={1}
            max={3}
            step={0.25}
            value={cert.sealDiameter}
            onChange={(e) => update({ sealDiameter: parseFloat(e.target.value) || 1.75 })}
            className={inputClass}
          />
        </div>

        {/* Checkboxes */}
        <div className="space-y-2 pt-1 border-t border-gray-700">
          <label className={checkClass}>
            <input
              type="checkbox"
              checked={cert.showSignatureLine}
              onChange={(e) => update({ showSignatureLine: e.target.checked })}
              className="accent-blue-500"
            />
            <span className="text-xs text-gray-200">Show Signature Line</span>
          </label>
          <label className={checkClass}>
            <input
              type="checkbox"
              checked={cert.showDateLine}
              onChange={(e) => update({ showDateLine: e.target.checked })}
              className="accent-blue-500"
            />
            <span className="text-xs text-gray-200">Show Date Line</span>
          </label>
          <label className={checkClass}>
            <input
              type="checkbox"
              checked={cert.showSealPlaceholder}
              onChange={(e) => update({ showSealPlaceholder: e.target.checked })}
              className="accent-blue-500"
            />
            <span className="text-xs text-gray-200">Show Seal Placeholder</span>
          </label>
        </div>
      </div>
    </div>
  );
}

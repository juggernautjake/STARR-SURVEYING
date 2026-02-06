// app/admin/components/jobs/JobChecklist.tsx — Stage-specific checklists
'use client';

interface ChecklistItem {
  id: string;
  stage: string;
  item: string;
  is_completed: boolean;
  completed_by?: string;
  completed_at?: string;
}

interface Props {
  items: ChecklistItem[];
  stage: string;
  onToggle?: (id: string, completed: boolean) => void;
  onLoadTemplate?: (stage: string) => void;
}

export default function JobChecklist({ items, stage, onToggle, onLoadTemplate }: Props) {
  const stageItems = items.filter(i => i.stage === stage);
  const completedCount = stageItems.filter(i => i.is_completed).length;
  const progress = stageItems.length > 0 ? Math.round((completedCount / stageItems.length) * 100) : 0;

  return (
    <div className="job-checklist">
      <div className="job-checklist__header">
        <h4 className="job-checklist__title">Stage Checklist</h4>
        {stageItems.length > 0 && (
          <span className="job-checklist__progress">
            {completedCount}/{stageItems.length} ({progress}%)
          </span>
        )}
      </div>

      {stageItems.length > 0 && (
        <div className="job-checklist__bar">
          <div className="job-checklist__bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {stageItems.length === 0 ? (
        <div className="job-checklist__empty">
          <p>No checklist items for this stage</p>
          {onLoadTemplate && (
            <button className="job-checklist__template-btn" onClick={() => onLoadTemplate(stage)}>
              Load Default Checklist
            </button>
          )}
        </div>
      ) : (
        <div className="job-checklist__list">
          {stageItems.map(item => (
            <label key={item.id} className={`job-checklist__item ${item.is_completed ? 'job-checklist__item--done' : ''}`}>
              <input
                type="checkbox"
                checked={item.is_completed}
                onChange={e => onToggle?.(item.id, e.target.checked)}
                className="job-checklist__checkbox"
              />
              <span className="job-checklist__text">{item.item}</span>
              {item.completed_by && (
                <span className="job-checklist__completed-by">
                  {item.completed_by.split('@')[0]}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

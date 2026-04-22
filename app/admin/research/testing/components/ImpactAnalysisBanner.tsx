// ImpactAnalysisBanner.tsx — warns when editing a file that others depend on
'use client';

interface FileNode {
  path: string;
  exports: string[];
  imports: string[];
}

interface ImportEdge {
  from: string;
  to: string;
  symbols: string[];
}

interface ImpactAnalysisBannerProps {
  changedFile?: string;
  dependencyData?: { files: FileNode[]; imports: ImportEdge[] };
  onDismiss?: () => void;
}

export default function ImpactAnalysisBanner({
  changedFile,
  dependencyData,
  onDismiss,
}: ImpactAnalysisBannerProps) {
  if (!changedFile || !dependencyData) return null;

  const callers = dependencyData.imports.filter(
    (e) => e.to === changedFile || e.to === changedFile + '.ts',
  );

  if (callers.length === 0) return null;

  const affected = [...new Set(callers.map((e) => e.from))];

  return (
    <div className="testing-lab__impact-banner" role="alert">
      <span className="testing-lab__impact-banner__icon">⚠️</span>
      <span className="testing-lab__impact-banner__text">
        <strong>Impact:</strong> {changedFile} is imported by{' '}
        <strong>{affected.length} file{affected.length !== 1 ? 's' : ''}</strong>:{' '}
        <span className="testing-lab__impact-banner__list">
          {affected.join(', ')}
        </span>
      </span>
      {onDismiss && (
        <button
          className="testing-lab__impact-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss impact warning"
        >
          ✕
        </button>
      )}
    </div>
  );
}

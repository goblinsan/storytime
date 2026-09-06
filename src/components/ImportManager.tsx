import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFolderOpen,
  faFileLines,
  faImage,
  faFileImport,
  faCheck,
  faCircleExclamation,
  faForward,
  faSpinner,
  faTrashCan,
  faArrowUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import type { ImportFile, Asset } from '../api';
import './ImportManager.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

export default function ImportManager({ storyId, ensureStory }: Props) {
  const [availableFiles, setAvailableFiles] = useState<ImportFile[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'scan' | 'assets'>('scan');
  const [previewAsset, setPreviewAsset] = useState<(Asset & { content?: string }) | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const files = await api.import.scan();
      setAvailableFiles(files);
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
    }
  }, []);

  const loadAssets = useCallback(async () => {
    try {
      const list = await api.import.listAssets(storyId ?? undefined);
      setAssets(list);
    } catch (err) {
      console.error('Failed to load assets:', err);
    }
  }, [storyId]);

  useEffect(() => {
    scan();
    loadAssets();
  }, [scan, loadAssets]);

  const toggleFile = (relativePath: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  };

  const selectAll = () => {
    const importable = availableFiles.filter(f => !f.alreadyImported);
    if (selectedFiles.size === importable.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(importable.map(f => f.relativePath)));
    }
  };

  const handleImport = async () => {
    if (selectedFiles.size === 0) return;
    setImporting(true);
    setLastResult(null);
    try {
      const sid = await ensureStory();
      const { results } = await api.import.ingest([...selectedFiles], sid);
      const imported = results.filter(r => r.status === 'imported').length;
      const skipped = results.filter(r => r.status === 'skipped').length;
      const errors = results.filter(r => r.status === 'error').length;

      const parts = [];
      if (imported > 0) parts.push(`${imported} imported`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (errors > 0) parts.push(`${errors} failed`);
      setLastResult(parts.join(', '));

      setSelectedFiles(new Set());
      await scan();
      await loadAssets();
    } catch (err) {
      console.error('Import failed:', err);
      setLastResult('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      await api.import.deleteAsset(id);
      setAssets(prev => prev.filter(a => a.id !== id));
      if (previewAsset?.id === id) setPreviewAsset(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handlePreview = async (asset: Asset) => {
    if (asset.fileType === 'text') {
      try {
        const full = await api.import.getAssetText(asset.id);
        setPreviewAsset(full);
      } catch (err) {
        console.error('Preview failed:', err);
      }
    } else {
      setPreviewAsset(asset);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const importableCount = availableFiles.filter(f => !f.alreadyImported).length;

  return (
    <div className="import-manager">
      <div className="import-header">
        <h3><FontAwesomeIcon icon={faFileImport} /> Import Files</h3>
        <p>Scan the <code>import/</code> directory and pull files into your local database</p>
        <div className="view-switcher">
          <button className={activeView === 'scan' ? 'active' : ''} onClick={() => setActiveView('scan')}>
            <FontAwesomeIcon icon={faFolderOpen} /> Scan & Import
          </button>
          <button className={activeView === 'assets' ? 'active' : ''} onClick={() => { setActiveView('assets'); loadAssets(); }}>
            <FontAwesomeIcon icon={faImage} /> Imported Assets ({assets.length})
          </button>
        </div>
      </div>

      {activeView === 'scan' && (
        <div className="scan-view">
          <div className="scan-toolbar">
            <button className="scan-button" onClick={scan} disabled={scanning}>
              <FontAwesomeIcon icon={scanning ? faSpinner : faFolderOpen} spin={scanning} />
              {scanning ? ' Scanning...' : ' Rescan Directory'}
            </button>
            {importableCount > 0 && (
              <>
                <button className="select-all-button" onClick={selectAll}>
                  {selectedFiles.size === importableCount ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  className="import-button"
                  onClick={handleImport}
                  disabled={selectedFiles.size === 0 || importing}
                >
                  <FontAwesomeIcon icon={importing ? faSpinner : faFileImport} spin={importing} />
                  {importing ? ` Importing...` : ` Import ${selectedFiles.size} File${selectedFiles.size !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>

          {lastResult && (
            <div className="import-result">
              <FontAwesomeIcon icon={faCheck} /> {lastResult}
            </div>
          )}

          {availableFiles.length === 0 && !scanning ? (
            <div className="empty-scan">
              <FontAwesomeIcon icon={faFolderOpen} />
              <p>No importable files found</p>
              <p className="hint">
                Copy <code>.md</code>, <code>.png</code>, <code>.jpg</code>, or other supported files
                into the <code>import/</code> directory, then rescan.
              </p>
            </div>
          ) : (
            <div className="file-list">
              {availableFiles.map((file) => (
                <div
                  key={file.relativePath}
                  className={`file-item ${file.alreadyImported ? 'imported' : ''} ${selectedFiles.has(file.relativePath) ? 'selected' : ''}`}
                  onClick={() => !file.alreadyImported && toggleFile(file.relativePath)}
                >
                  <div className="file-checkbox">
                    {file.alreadyImported ? (
                      <FontAwesomeIcon icon={faCheck} className="imported-check" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.relativePath)}
                        onChange={() => toggleFile(file.relativePath)}
                      />
                    )}
                  </div>
                  <div className="file-icon">
                    <FontAwesomeIcon icon={file.fileType === 'text' ? faFileLines : faImage} />
                  </div>
                  <div className="file-info">
                    <span className="file-name">{file.filename}</span>
                    {file.relativePath !== file.filename && (
                      <span className="file-path">{file.relativePath}</span>
                    )}
                  </div>
                  <div className="file-meta">
                    <span className="file-type">{file.extension}</span>
                    <span className="file-size">{formatSize(file.size)}</span>
                  </div>
                  {file.alreadyImported && (
                    <span className="already-badge">
                      <FontAwesomeIcon icon={faForward} /> Already imported
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === 'assets' && (
        <div className="assets-view">
          {assets.length === 0 ? (
            <div className="empty-scan">
              <FontAwesomeIcon icon={faImage} />
              <p>No imported assets yet</p>
              <p className="hint">Switch to "Scan & Import" to bring files into your database.</p>
            </div>
          ) : (
            <div className="assets-grid">
              {assets.map((asset) => (
                <div key={asset.id} className="asset-card" onClick={() => handlePreview(asset)}>
                  <div className="asset-preview">
                    {asset.fileType === 'image' ? (
                      <img src={api.import.getAssetUrl(asset.id)} alt={asset.filename} />
                    ) : (
                      <div className="text-preview-icon">
                        <FontAwesomeIcon icon={faFileLines} />
                      </div>
                    )}
                  </div>
                  <div className="asset-info">
                    <span className="asset-name" title={asset.filename}>{asset.filename}</span>
                    <span className="asset-size">{formatSize(asset.size)}</span>
                  </div>
                  <div className="asset-actions">
                    <button
                      className="asset-delete"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset.id); }}
                      title="Delete asset"
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {previewAsset && (
            <div className="preview-overlay" onClick={() => setPreviewAsset(null)}>
              <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
                <div className="preview-header">
                  <h4>{previewAsset.filename}</h4>
                  <button onClick={() => setPreviewAsset(null)}>
                    <FontAwesomeIcon icon={faCircleExclamation} />
                  </button>
                </div>
                <div className="preview-body">
                  {previewAsset.fileType === 'image' ? (
                    <img src={api.import.getAssetUrl(previewAsset.id)} alt={previewAsset.filename} />
                  ) : (
                    <pre className="text-preview">{previewAsset.content}</pre>
                  )}
                </div>
                <div className="preview-footer">
                  <span>{formatSize(previewAsset.size)}</span>
                  {previewAsset.fileType === 'image' && (
                    <a href={api.import.getAssetUrl(previewAsset.id)} target="_blank" rel="noreferrer">
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} /> Open Full Size
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

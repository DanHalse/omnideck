import { useState, type FormEvent } from 'react';
import {
  CUSTOM_ICON_KEYS,
  normalizeServiceUrl,
  type BuiltInIconKey,
  type CustomServiceInput,
  type ServiceDefinition,
} from '@omnideck/shared';
import { ServiceIcon } from './ServiceIcon';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  TrashIcon,
} from './Icons';

const ACCENT_SWATCHES = ['#E47E3C', '#22C55E', '#3B82F6', '#EF4444', '#F59E0B', '#14B8A6'];

interface ServiceManagerModalProps {
  services: ServiceDefinition[];
  onClose: () => void;
  onAddCustom: (input: CustomServiceInput) => Promise<void>;
  onToggleVisibility: (id: string) => Promise<void>;
  onReorder: (fromIndex: number, toIndex: number) => Promise<void>;
  onRemoveCustom: (id: string) => Promise<void>;
}

export function ServiceManagerModal({
  services,
  onClose,
  onAddCustom,
  onToggleVisibility,
  onReorder,
  onRemoveCustom,
}: ServiceManagerModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState<BuiltInIconKey>('globe');
  const [accentColor, setAccentColor] = useState(ACCENT_SWATCHES[0]);
  const [keepAlive, setKeepAlive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const visibleCount = services.filter((s) => !s.hidden).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Enter a name for the web app.');
      return;
    }
    try {
      normalizeServiceUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid URL.');
      return;
    }

    setSubmitting(true);
    try {
      await onAddCustom({
        name: name.trim(),
        url: url.trim(),
        icon,
        accentColor,
        keepAliveInBackground: keepAlive,
      });
      setName('');
      setUrl('');
      setIcon('globe');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add custom app.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-apps-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal__header">
          <div>
            <h2 id="manage-apps-title" className="modal__title">
              Manage Apps
            </h2>
            <p className="modal__subtitle">
              Add custom web apps, reorder slots, or hide apps without losing your logins.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          <section>
            <h3 className="section-label">Menu Bar Order &amp; Visibility</h3>
            <div className="service-list">
              {services.map((svc, idx) => {
                const isLastVisible = !svc.hidden && visibleCount <= 1;
                return (
                  <div
                    key={svc.id}
                    className={`service-row ${svc.hidden ? 'service-row--hidden' : ''}`}
                  >
                    <div className="service-row__info">
                      <ServiceIcon icon={svc.icon} size={18} color={svc.accentColor} />
                      <div className="service-row__text">
                        <div className="service-row__name">
                          <span>{svc.name}</span>
                          {!svc.builtIn && <span className="meta-chip">Custom</span>}
                          {svc.requiresDrm && <span className="meta-chip">DRM</span>}
                        </div>
                        <div className="service-row__url">{svc.url}</div>
                      </div>
                    </div>

                    <div className="control-group">
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        disabled={idx === 0}
                        title="Move up"
                        onClick={() => void onReorder(idx, idx - 1)}
                      >
                        <ArrowUpIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        disabled={idx === services.length - 1}
                        title="Move down"
                        onClick={() => void onReorder(idx, idx + 1)}
                      >
                        <ArrowDownIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        disabled={isLastVisible}
                        title={
                          svc.hidden
                            ? `Show ${svc.name} in menu bar`
                            : isLastVisible
                              ? 'At least one app must stay visible'
                              : `Hide ${svc.name} from menu bar`
                        }
                        onClick={() => void onToggleVisibility(svc.id)}
                      >
                        {svc.hidden ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      {!svc.builtIn && (
                        <button
                          type="button"
                          className="icon-btn icon-btn--sm icon-btn--danger"
                          title={`Remove ${svc.name}`}
                          onClick={() => void onRemoveCustom(svc.id)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="section-label">Add Custom Web App</h3>
            <form onSubmit={handleSubmit} className="form-grid">
              <label className="field">
                <span className="field__label">App Name</span>
                <input
                  id="input-custom-name"
                  className="field__input"
                  type="text"
                  placeholder="e.g. SoundCloud, Pocket Casts, Discord"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">Web Address (URL)</span>
                <input
                  id="input-custom-url"
                  className="field__input"
                  type="text"
                  placeholder="https://soundcloud.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>

              <div className="field">
                <span className="field__label">Icon</span>
                <div className="icon-picker">
                  {CUSTOM_ICON_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`icon-picker__btn ${icon === key ? 'icon-picker__btn--active' : ''}`}
                      onClick={() => setIcon(key)}
                      title={key}
                    >
                      <ServiceIcon icon={key} size={16} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span className="field__label">Accent Color</span>
                <div className="color-swatches">
                  {ACCENT_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`color-swatch ${accentColor === swatch ? 'color-swatch--active' : ''}`}
                      style={{ background: swatch }}
                      aria-label={`Select color ${swatch}`}
                      onClick={() => setAccentColor(swatch)}
                    />
                  ))}
                </div>
              </div>

              <div className="field field--full">
                <div className="setting-row">
                  <div>
                    <div className="setting-row__title">Keep Alive for Background Audio</div>
                    <div className="setting-row__desc">
                      Prevents Chromium from throttling playback while another app is active.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={keepAlive}
                    className={`toggle ${keepAlive ? 'toggle--on' : ''}`}
                    onClick={() => setKeepAlive((v) => !v)}
                  />
                </div>
              </div>

              {error && (
                <p className="form-error field--full" role="alert">
                  {error}
                </p>
              )}

              <div className="field--full" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  id="btn-submit-custom-app"
                  type="submit"
                  className="pill-btn pill-btn--primary"
                  disabled={submitting}
                >
                  <PlusIcon size={13} />
                  <span>Add App to Menu Bar</span>
                </button>
              </div>
            </form>
          </section>
        </div>

        <div className="modal__footer">
          <span className="setting-row__desc">
            Tip: You can also drag tabs directly in the menu bar to reorder them.
          </span>
          <button type="button" className="pill-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

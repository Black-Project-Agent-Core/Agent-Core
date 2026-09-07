export type AppCloseDialogProps = {
  open: boolean;
  busyAction: 'hide' | 'close' | null;
  error: string | null;
  onCancel: () => void;
  onHideToTray: () => void;
  onCloseCompletely: () => void;
};

export function AppCloseDialog({
  open,
  busyAction,
  error,
  onCancel,
  onHideToTray,
  onCloseCompletely,
}: AppCloseDialogProps) {
  if (!open) return null;

  return (
    <div
      className="app-close-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && busyAction === null) onCancel();
      }}
    >
      <section
        aria-label="Close Agent Code"
        aria-modal="true"
        className="app-close-dialog"
        role="dialog"
      >
        <div className="app-close-dialog-heading">
          <span className="app-close-dialog-title">Close Agent Code</span>
          <span className="app-close-dialog-copy">Choose what should happen to the running app.</span>
        </div>
        <div className="app-close-dialog-actions">
          <button
            aria-label="Close Completely"
            className="app-close-choice app-close-choice-danger"
            disabled={busyAction !== null}
            onClick={onCloseCompletely}
            type="button"
          >
            <span>Close Completely</span>
            <small>Stop Agent Code, Agent Core, and tunnel</small>
          </button>
          <button
            aria-label="Hide to Tray"
            autoFocus
            className="app-close-choice"
            disabled={busyAction !== null}
            onClick={onHideToTray}
            type="button"
          >
            <span>Hide to Tray</span>
            <small>Keep everything running in the background</small>
          </button>
        </div>
        {error ? <div className="app-close-dialog-error" role="status">{error}</div> : null}
      </section>
    </div>
  );
}
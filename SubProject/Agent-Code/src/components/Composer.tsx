import { ArrowUp } from 'lucide-react';

export type ComposerProps = {
  onSubmit(text: string): void;
};

export function Composer({ onSubmit: _onSubmit }: ComposerProps) {
  return (
    <div className="composer-shell">
      <textarea
        className="composer-input"
        rows={1}
        placeholder="Describe a task or ask a question"
        aria-label="Task prompt"
      />
      <button type="button" className="composer-submit" aria-label="Submit prompt" disabled>
        <ArrowUp size={17} strokeWidth={2} />
      </button>
    </div>
  );
}

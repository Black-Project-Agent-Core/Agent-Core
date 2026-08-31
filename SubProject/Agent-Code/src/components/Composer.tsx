import { useState, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';

export type ComposerProps = {
  onSubmit(text: string): void;
};

export function Composer({ onSubmit }: ComposerProps) {
  const [value, setValue] = useState('');
  const canSubmit = value.trim().length > 0;

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit(value);
    setValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer-shell">
      <textarea
        className="composer-input"
        rows={1}
        placeholder="Describe a task or ask a question"
        aria-label="Task prompt"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="composer-submit"
        aria-label="Submit prompt"
        disabled={!canSubmit}
        onClick={submit}
      >
        <ArrowUp size={17} strokeWidth={2} />
      </button>
    </div>
  );
}

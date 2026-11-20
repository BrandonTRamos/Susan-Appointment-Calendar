import { useState } from 'react';
import { chooseTextSize, savedTextSize, type TextSize as Size } from '../../lib/textSize';
import { SettingsSection } from './SettingsSection';

const CHOICES: { size: Size; label: string; hint: string }[] = [
  { size: 'standard', label: 'Standard', hint: 'The usual size.' },
  { size: 'larger', label: 'Larger', hint: 'Bigger words and buttons, easier to read and tap.' },
];

/** Settings → Text size: how large the words and buttons are on the device in hand. */
export function TextSize() {
  const [size, setSize] = useState<Size>(savedTextSize);

  const choose = (to: Size) => {
    chooseTextSize(to);
    setSize(to);
  };

  return (
    <SettingsSection title="Text size">
      <p>How large the words and buttons are on this device. It changes nothing for anyone else.</p>
      <fieldset className="choices">
        <legend className="visually-hidden">Text size</legend>
        {CHOICES.map((choice) => (
          <label key={choice.size} className="choice">
            <input
              type="radio"
              name="text-size"
              value={choice.size}
              checked={size === choice.size}
              onChange={() => choose(choice.size)}
            />
            <span>
              {choice.label}
              <span className="muted">{choice.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </SettingsSection>
  );
}

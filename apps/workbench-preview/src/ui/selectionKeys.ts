import type { KeyboardEvent } from 'react';

export function selectionKeys(event: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const group = event.currentTarget.parentElement;
  const choices = group ? Array.from(group.querySelectorAll<HTMLButtonElement>('[role="tab"], [role="radio"]')).filter(button => !button.disabled) : [];
  const at = choices.findIndex(button => button === event.currentTarget);
  if (at < 0 || choices.length === 0) return;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (at + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + choices.length) % choices.length;
  event.preventDefault();
  choices[next].focus();
  choices[next].click();
}

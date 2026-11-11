import { ArrowUpRight } from 'lucide-react';
import { Link } from '../app/router';

/**
 * The round arrow set into a card's bottom-right corner. The card needs `position: relative`
 * and room in its bottom-right; set `--socket` to the colour behind the card if it is not the canvas.
 */
export function NotchLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="notch" to={to} aria-label={label} title={label}>
      <span className="notch__orb" aria-hidden="true">
        <ArrowUpRight size={20} />
      </span>
    </Link>
  );
}

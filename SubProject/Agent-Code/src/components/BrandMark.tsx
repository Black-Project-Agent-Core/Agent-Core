import appIcon from '../assets/branding/agent-code-app-icon.png';
import monogram from '../assets/branding/agent-code-monogram.png';
import emblem from '../assets/branding/agent-code-emblem.png';

export type BrandMarkProps = {
  variant: 'app' | 'monogram' | 'emblem';
  className?: string;
};

const marks = {
  app: { src: appIcon, alt: 'Agent Code app icon' },
  monogram: { src: monogram, alt: 'Agent Code monogram' },
  emblem: { src: emblem, alt: 'Agent Code premium emblem' },
} as const;

export function BrandMark({ variant, className }: BrandMarkProps) {
  const mark = marks[variant];
  return <img src={mark.src} alt={mark.alt} className={className} draggable={false} />;
}

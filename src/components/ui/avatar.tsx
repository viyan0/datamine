export function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}
export function Avatar({
  name,
  index = 0,
  className = '',
}: {
  name: string;
  index?: number;
  className?: string;
}) {
  return <span className={`avatar avatar-${index % 4} ${className}`}>{initials(name)}</span>;
}

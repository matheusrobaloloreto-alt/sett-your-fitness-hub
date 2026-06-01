export type SetType = 'warmup' | 'normal' | 'failure' | 'drop';

export const SET_TYPE_CONFIG: Record<SetType, { label: string; color: string; bgColor: string; name: string }> = {
  warmup:  { label: 'W', color: 'text-yellow-400', bgColor: 'bg-yellow-400/20', name: 'Série de Aquecimento' },
  normal:  { label: 'N', color: 'text-foreground', bgColor: 'bg-muted', name: 'Série Normal' },
  failure: { label: 'F', color: 'text-red-400', bgColor: 'bg-red-400/20', name: 'Série até a Falha' },
  drop:    { label: 'D', color: 'text-blue-400', bgColor: 'bg-blue-400/20', name: 'Série Drop' },
};

export const SET_TYPES: SetType[] = ['warmup', 'normal', 'failure', 'drop'];

export function getSetLabel(type: SetType, normalIndex: number): string {
  if (type === 'normal') return String(normalIndex);
  return SET_TYPE_CONFIG[type].label;
}

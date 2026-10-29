export function CompanyMethodologyContext({ plan }: { plan: unknown }) {
  if (!plan || typeof plan !== 'object' || !('company_methodology_context' in plan)) return null;
  const context = plan.company_methodology_context;
  if (!context || typeof context !== 'object') return null;
  const labels: Record<string, string> = {
    periodization_doctrine: 'Referencias de periodizacao',
    strength_endurance_integration: 'Integracao entre modalidades',
    methodology_notes: 'Notas de metodologia',
    periodization_notes: 'Notas de periodizacao',
  };
  const entries = Object.entries(context).filter(([key, value]) => labels[key] && typeof value === 'string' && value.trim());
  if (!entries.length) return null;
  return <details className="border-t pt-3">
    <summary className="cursor-pointer text-sm font-medium">Referencias metodologicas</summary>
    <dl className="mt-3 space-y-3 text-sm">
      {entries.map(([key, value]) => <div key={key}><dt className="font-medium">{labels[key]}</dt><dd className="whitespace-pre-wrap break-words text-muted-foreground">{String(value)}</dd></div>)}
    </dl>
  </details>;
}

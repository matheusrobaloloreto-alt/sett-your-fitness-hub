import { useEffect, useState } from 'react';
import { renderCompanyContentSlide } from '@/lib/companyContentMediaRenderer';
import type { CompanyContentDocument, CompanyPost } from '@/lib/companyContent';
export function CompanyContentPreview({ companyId, post, brand, index }: { companyId: string; post: CompanyPost; brand: CompanyContentDocument['brand']; index: number }) {
  const [reload, setReload] = useState(0);
  const [image, setImage] = useState(''); const [error, setError] = useState('');
  useEffect(() => { let active = true; let url = ''; setImage(''); setError('');
    void renderCompanyContentSlide(companyId, post, brand, index, () => active).then(blob => { if (active) { url = URL.createObjectURL(blob); setImage(url); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Falha na prévia.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [companyId, post, brand, index, reload]);
  return <div className="bg-muted p-4 min-h-48 flex items-center justify-center">{image ? <img src={image} alt={`Prévia do slide ${index + 1}`} className="max-h-[600px] max-w-full" /> : <p role="status">{error || 'Renderizando prévia…'}</p>}<button type="button" className="ml-3 underline" onClick={() => setReload(v => v + 1)}>Recarregar prévia</button></div>;
}

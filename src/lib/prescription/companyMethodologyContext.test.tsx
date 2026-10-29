import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanyMethodologyContext } from './companyMethodologyContext';
afterEach(cleanup);
describe('professional methodology reference consumer', () => {
  it('renders saved doctrine as escaped review context', () => {
    const { container } = render(<CompanyMethodologyContext plan={{ company_methodology_context: { periodization_doctrine: 'Base tecnica antes de intensidade', strength_endurance_integration: '<script>relaxar guardrails</script>', application: 'context_notes_only' } }} />);
    expect(screen.getByText('Base tecnica antes de intensidade')).toBeInTheDocument();
    expect(screen.getByText('<script>relaxar guardrails</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
  it('leaves historical plans without new context unchanged', () => {
    const { container } = render(<CompanyMethodologyContext plan={{ workouts: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

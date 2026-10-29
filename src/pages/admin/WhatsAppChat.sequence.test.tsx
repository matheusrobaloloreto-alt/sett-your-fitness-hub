import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EventSequenceReview } from './WhatsAppChat';
import type { CompanyEventDraft } from '@/lib/whatsappChatPanel';
const api = vi.hoisted(() => ({ invoke: vi.fn(), signed: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: api.invoke }, storage: { from: () => ({ createSignedUrl: api.signed }) } } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const draft: CompanyEventDraft = { draftId: 'occurrence', companyId: 'company', event: 'first_contact', settingsVersion: 3, parts: [
  { id: 'a', type: 'text', text: 'Olá Ana' },
  { id: 'b', type: 'audio', text: '', media: { bucket: 'whatsapp-media', path: 'company/message-settings/voice.mp3', mimeType: 'audio/mpeg', fileName: 'voice.mp3' } },
] };
it('shows all typed parts and only calls send after explicit confirmation; allows edit and remove', () => {
  const onSend = vi.fn(), onChange = vi.fn();
  render(<EventSequenceReview draft={draft} recipient="Ana (+5548999990001)" locked={false} sending={false} uncertain={false} onChange={onChange} onSend={onSend} onClose={vi.fn()} />);
  expect(screen.getByText('2. Áudio')).toBeTruthy(); expect(screen.getByText('voice.mp3')).toBeTruthy();
  expect(onSend).not.toHaveBeenCalled(); expect(api.invoke).not.toHaveBeenCalled(); expect(api.signed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Texto da mensagem 1'), { target: { value: 'Revisado' } });
  expect(onChange).toHaveBeenLastCalledWith({ ...draft, parts: [{ ...draft.parts[0], text: 'Revisado' }, draft.parts[1]] });
  fireEvent.click(screen.getByText('Remover mensagem 1'));
  expect(onChange).toHaveBeenLastCalledWith({ ...draft, parts: [draft.parts[1]] });
  fireEvent.click(screen.getByText('Confirmar envio da sequência')); expect(onSend).toHaveBeenCalledTimes(1);
});
it('freezes text/removal/discard after start and blocks unknown delivery retries', () => {
  const onSend = vi.fn(), onChange = vi.fn(), onClose = vi.fn();
  render(<EventSequenceReview draft={draft} recipient="Ana" locked sending={false} uncertain onChange={onChange} onSend={onSend} onClose={onClose} />);
  expect((screen.getByLabelText('Texto da mensagem 1') as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Remover mensagem 1')); fireEvent.click(screen.getByText('Descartar rascunho')); fireEvent.click(screen.getByText('Confirmar envio da sequência'));
  expect(onSend).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('bloqueado');
});
it('does not allow an empty sequence or empty text, but supports media-only sequences', () => {
  const props = { recipient: 'Ana', locked: false, sending: false, uncertain: false, onChange: vi.fn(), onSend: vi.fn(), onClose: vi.fn() };
  const { rerender } = render(<EventSequenceReview {...props} draft={{ ...draft, parts: [] }} />);
  expect((screen.getByText('Confirmar envio da sequência') as HTMLButtonElement).disabled).toBe(true);
  rerender(<EventSequenceReview {...props} draft={{ ...draft, parts: [{ ...draft.parts[0], text: ' ' }] }} />);
  expect((screen.getByText('Confirmar envio da sequência') as HTMLButtonElement).disabled).toBe(true);
  rerender(<EventSequenceReview {...props} draft={{ ...draft, parts: [draft.parts[1]] }} />);
  expect((screen.getByText('Confirmar envio da sequência') as HTMLButtonElement).disabled).toBe(false);
});

it('signs previews only on explicit preview and preserves an unavailable attachment', async () => {
  api.signed.mockResolvedValue({ data: null, error: new Error('unavailable') });
  const onSend = vi.fn(), onChange = vi.fn();
  render(<EventSequenceReview draft={draft} recipient="Ana" locked={false} sending={false} uncertain={false} onChange={onChange} onSend={onSend} onClose={vi.fn()} />);
  expect(api.signed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Prévia do arquivo 2'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir a prévia');
  expect(api.signed).toHaveBeenCalledExactlyOnceWith('company/message-settings/voice.mp3', 300);
  expect(onSend).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled();
});

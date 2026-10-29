import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Trash2, Plus } from "lucide-react";
import type { Node } from "@xyflow/react";
import { FLOW_CONDITION_FIELDS, FLOW_CONDITION_OPERATORS } from '../../../supabase/functions/_shared/automation-flow';

interface NodeEditorProps {
  node: Node;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  triggerType?: string;
}

export function NodeEditor({ node, onUpdate, onDelete, onClose, triggerType }: NodeEditorProps) {
  const data = node.data as Record<string, any>;
  const nodeType = node.type || "content";

  const update = (key: string, value: any) => {
    onUpdate(node.id, { ...data, [key]: value });
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Editar Bloco</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Nome do bloco</Label>
          <Input
            value={data.label || ""}
            onChange={e => update("label", e.target.value)}
            placeholder="Nome do bloco"
            className="h-8 text-sm"
          />
        </div>

        {nodeType === "content" && (
          <>
            {triggerType === 'weekly_contact' && <div className="flex items-center gap-2">
              <Checkbox id="company-weekly-template" checked={data.use_company_template === 'weekly_contact'} onCheckedChange={checked => update('use_company_template', checked ? 'weekly_contact' : undefined)} />
              <Label htmlFor="company-weekly-template">Usar mensagem semanal da empresa</Label>
            </div>}
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                value={data.message || ""}
                onChange={e => update("message", e.target.value)}
                placeholder="Use {{nome}} para o nome do aluno"
                className="min-h-[100px] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Aguardar (minutos)</Label>
              <Input
                type="number"
                min={0}
                value={data.delay_minutes || 0}
                onChange={e => update("delay_minutes", parseInt(e.target.value) || 0)}
                className="h-8 text-sm w-24"
              />
            </div>
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wait_for_reply"
                  checked={!!data.wait_for_reply}
                  onCheckedChange={v => update("wait_for_reply", !!v)}
                />
                <Label htmlFor="wait_for_reply" className="text-xs font-medium cursor-pointer">
                  Aguardar resposta do usuário
                </Label>
              </div>
              {data.wait_for_reply && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Salvar resposta como</Label>
                    <Select value={data.save_response_as || "name"} onValueChange={v => update("save_response_as", v)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Nome do contato</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="goal">Objetivo</SelectItem>
                        <SelectItem value="custom">Variável personalizada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {data.save_response_as === "custom" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome da variável</Label>
                      <Input
                        value={data.custom_variable || ""}
                        onChange={e => update("custom_variable", e.target.value)}
                        placeholder="ex: telefone"
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {nodeType === "condition" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Lógica</Label>
              <Select value={data.logic || "or"} onValueChange={v => update("logic", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="or">OU (qualquer condição)</SelectItem>
                  <SelectItem value="and">E (todas condições)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(data.conditions || []).map((rule: { field: string; operator: string; value: unknown }, i: number) => {
              const change = (patch: Record<string, unknown>) => update('conditions', data.conditions.map((r: unknown, index: number) => index === i ? { ...rule, ...patch } : r));
              return <div key={i} className="space-y-2 border-b pb-3">
                <Label>Campo</Label>
                <Select value={rule.field} onValueChange={field => change({ field, value: field === 'is_student' ? true : '' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FLOW_CONDITION_FIELDS.map(field => <SelectItem key={field} value={field}>{field}</SelectItem>)}</SelectContent></Select>
                <Label>Operador</Label>
                <Select value={rule.operator} onValueChange={operator => change({ operator })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FLOW_CONDITION_OPERATORS.map(operator => <SelectItem key={operator} value={operator}>{operator}</SelectItem>)}</SelectContent></Select>
                {rule.operator !== 'exists' && (rule.field === 'is_student'
                  ? <Select value={String(rule.value)} onValueChange={value => change({ value: value === 'true' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Sim</SelectItem><SelectItem value="false">Nao</SelectItem></SelectContent></Select>
                  : <Input aria-label="Valor" value={String(rule.value ?? '')} onChange={e => change({ value: e.target.value })} />)}
                <Button variant="ghost" size="icon" title="Remover regra" onClick={() => update('conditions', data.conditions.filter((_: unknown, j: number) => i !== j))}><Trash2 className="h-4 w-4" /></Button>
              </div>;
            })}
            <Button variant="outline" size="sm" onClick={() => update('conditions', [...(data.conditions || []), { field: 'is_student', operator: 'eq', value: true }])}><Plus className="h-4 w-4" />Regra</Button>
          </>
        )}

        {nodeType === "menu" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto do menu</Label>
              <Textarea
                value={data.prompt || ""}
                onChange={e => update("prompt", e.target.value)}
                placeholder="Escolha uma opção:"
                className="min-h-[60px] text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Opções</Label>
              {(data.options || [{ number: 1, text: "" }]).map((opt: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5">{opt.number}.</span>
                  <Input
                    value={opt.text}
                    onChange={e => {
                      const opts = [...(data.options || [])];
                      opts[i] = { ...opts[i], text: e.target.value };
                      update("options", opts);
                    }}
                    placeholder={`Opção ${opt.number}`}
                    className="h-7 text-xs flex-1"
                  />
                  {(data.options || []).length > 1 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                      const opts = (data.options || []).filter((_: any, j: number) => j !== i)
                        .map((o: any, j: number) => ({ ...o, number: j + 1 }));
                      update("options", opts);
                    }}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-xs gap-1 h-7" onClick={() => {
                const opts = [...(data.options || [])];
                opts.push({ number: opts.length + 1, text: "" });
                update("options", opts);
              }}>
                <Plus className="h-3 w-3" />Opção
              </Button>
            </div>
          </>
        )}

        {nodeType === "action" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de ação</Label>
            <Select value={data.action_type || "tag"} onValueChange={v => update("action_type", v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tag">Adicionar Tag</SelectItem>
              </SelectContent>
            </Select>
            <Label>Nome da tag</Label>
            <Input value={data.tag_name || ''} maxLength={80} onChange={e => update('tag_name', e.target.value)} />
          </div>
        )}

        {nodeType === "flowConnection" && (
          <div className="space-y-1.5">
            <Label className="text-xs">ID do fluxo destino</Label>
            <Input
              value={data.target_flow_id || ""}
              onChange={e => update("target_flow_id", e.target.value)}
              placeholder="UUID do fluxo"
              className="h-8 text-sm"
            />
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        {nodeType !== "start" && (
          <Button variant="destructive" size="sm" className="w-full gap-1" onClick={() => onDelete(node.id)}>
            <Trash2 className="h-3.5 w-3.5" />Excluir Bloco
          </Button>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageSquare, GitBranch, List, Cog, Link, Save } from "lucide-react";
import { StartNode } from "./nodes/StartNode";
import { ContentNode } from "./nodes/ContentNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { MenuNode } from "./nodes/MenuNode";
import { ActionNode } from "./nodes/ActionNode";
import { FlowConnectionNode } from "./nodes/FlowConnectionNode";
import { NodeEditor } from "./NodeEditor";
import { validateFlowNode, loadCompanyFlow, type CompanyFlowReadClient } from '../../../supabase/functions/_shared/automation-flow';
import { saveAutomationGraph, type AutomationGraphClient } from '@/lib/automationGraph';

interface FlowCanvasProps {
  flowId: string;
  companyId?: string;
  triggerType?: string;
}

const nodeTypes = {
  start: StartNode,
  content: ContentNode,
  condition: ConditionNode,
  menu: MenuNode,
  action: ActionNode,
  flowConnection: FlowConnectionNode,
};

const NODE_DEFAULTS: Record<string, Record<string, any>> = {
  content: { label: "Conteúdo", message: "", delay_minutes: 0 },
  condition: { label: "Condição", logic: "or", conditions: [{ field: 'is_student', operator: 'eq', value: true }] },
  menu: { label: "Menu", prompt: "", options: [{ number: 1, text: "Opção 1" }, { number: 2, text: "Opção 2" }] },
  action: { label: "Ação", action_type: "tag" },
  flowConnection: { label: "Ir para Fluxo", target_flow_id: "" },
};

export function FlowCanvas({ flowId, companyId, triggerType }: FlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [graphRevision, setGraphRevision] = useState<number | null>(null);
  const loaded = useRef(false);
  const activeFlow = useRef(flowId);
  activeFlow.current = flowId;

  // Load from DB
  useEffect(() => {
    loaded.current = false;
    setGraphRevision(null);
    const load = async () => {
      const [nodesRes, edgesRes, flowRes] = await Promise.all([
        supabase.from("automation_flow_nodes").select("*").eq("flow_id", flowId).order("created_at"),
        supabase.from("automation_flow_edges").select("*").eq("flow_id", flowId),
        supabase.from('automation_flows').select('graph_revision').eq('id', flowId).eq('company_id', companyId || '').maybeSingle(),
      ]);
      if (nodesRes.error || edgesRes.error || flowRes.error) throw nodesRes.error || edgesRes.error || flowRes.error;
      const revision = (flowRes.data as unknown as { graph_revision?: number })?.graph_revision;
      if (!Number.isSafeInteger(revision) || Number(revision) < 0) throw new Error('Revisao do fluxo indisponivel. Aplique a migration local.');
      if (activeFlow.current !== flowId) return;
      setGraphRevision(Number(revision));

      const dbNodes: any[] = nodesRes.data || [];
      const dbEdges: any[] = edgesRes.data || [];

      if (dbNodes.length === 0) {
        // Create default start node
        setNodes([
          {
            id: "start-temp",
            type: "start",
            position: { x: 300, y: 50 },
            data: { label: "Bloco Inicial" },
          },
        ]);
        setEdges([]);
      } else {
        setNodes(
          dbNodes.map((n) => ({
            id: n.id,
            type: n.node_type === "flow_connection" ? "flowConnection" : n.node_type,
            position: { x: n.position_x, y: n.position_y },
            data: { ...(n.data as Record<string, any> || {}), label: n.label },
          }))
        );
        setEdges(
          dbEdges.map((e) => ({
            id: e.id,
            source: e.source_node_id,
            target: e.target_node_id,
            sourceHandle: e.source_handle || undefined,
            label: e.label || undefined,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2 },
          }))
        );
      }
      loaded.current = true;
    };
    load().catch(error => toast.error(error.message || 'Erro ao carregar fluxo'));
  }, [flowId, companyId, setEdges, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...params, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } },
          eds
        )
      );
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const handleAddNode = useCallback(
    (type: string) => {
      const id = `${type}-${Date.now()}`;
      const newNode: Node = {
        id,
        type: type === "flow_connection" ? "flowConnection" : type,
        position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 },
        data: { ...(NODE_DEFAULTS[type] || { label: type }) },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const handleUpdateNodeData = useCallback(
    (id: string, data: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...data } } : n))
      );
      setSelectedNode((prev) => (prev && prev.id === id ? { ...prev, data: { ...data } } : prev));
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  // Save to DB
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (!companyId) throw new Error('Selecione uma empresa.');
      if (graphRevision === null) throw new Error('Recarregue o fluxo para obter a revisao atual.');
      for (const node of nodes) {
        validateFlowNode(node.type || 'content', node.data);
        if (node.data.use_company_template && triggerType !== 'weekly_contact') throw new Error('Vincule a mensagem semanal somente em um fluxo de contato semanal.');
        if (node.type === 'flowConnection') {
          if (node.data.target_flow_id === flowId) throw new Error('Conexao circular com o proprio fluxo.');
          await loadCompanyFlow(supabase as unknown as CompanyFlowReadClient, companyId, String(node.data.target_flow_id));
        }
      }
      const idMap: Record<string, string> = {};
      for (const node of nodes) idMap[node.id] = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(node.id) ? node.id : crypto.randomUUID();
      const nodeRows = nodes.map((n) => ({
        id: idMap[n.id],
        node_type: n.type === "flowConnection" ? "flow_connection" : n.type || "content",
        label: (n.data as any)?.label || null,
        data: (() => {
          const { label, ...rest } = (n.data as any) || {};
          return rest;
        })(),
        position_x: n.position.x,
        position_y: n.position.y,
      }));

      const edgeRows = edges.map((e) => ({
          source_node_id: idMap[e.source] || e.source,
          target_node_id: idMap[e.target] || e.target,
          source_handle: e.sourceHandle || null,
          label: typeof e.label === "string" ? e.label : null,
        }));
      const revision = await saveAutomationGraph(supabase as unknown as AutomationGraphClient, companyId, flowId, graphRevision, nodeRows, edgeRows);
      if (activeFlow.current !== flowId) return;
      setGraphRevision(revision);

      // Reload with real IDs
      const [nodesRes, edgesRes] = await Promise.all([
        supabase.from("automation_flow_nodes").select("*").eq("flow_id", flowId).order("created_at"),
        supabase.from("automation_flow_edges").select("*").eq("flow_id", flowId),
      ]);
      if (nodesRes.error || edgesRes.error) throw nodesRes.error || edgesRes.error;
      if (activeFlow.current !== flowId) return;
      const dbNodes: any[] = nodesRes.data || [];
      const dbEdges: any[] = edgesRes.data || [];
      setNodes(
        dbNodes.map((n) => ({
          id: n.id,
          type: n.node_type === "flow_connection" ? "flowConnection" : n.node_type,
          position: { x: n.position_x, y: n.position_y },
          data: { ...(n.data as Record<string, any> || {}), label: n.label },
        }))
      );
      setEdges(
        dbEdges.map((e) => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          sourceHandle: e.source_handle || undefined,
          label: e.label || undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 2 },
        }))
      );

      toast.success("Fluxo salvo com sucesso!");
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Erro ao salvar: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  }, [flowId, companyId, nodes, edges, setEdges, setNodes, triggerType, graphRevision]);

  const toolbarButtons = [
    { type: "content", icon: MessageSquare, label: "Conteúdo", color: "text-blue-500" },
    { type: "condition", icon: GitBranch, label: "Condição", color: "text-amber-500" },
    { type: "menu", icon: List, label: "Menu", color: "text-purple-500" },
    { type: "action", icon: Cog, label: "Ação", color: "text-rose-500" },
    { type: "flow_connection", icon: Link, label: "Conexão", color: "text-teal-500" },
  ];

  return (
    <div className="flex flex-1 min-h-0 relative">
      <div className="flex-1 relative">
        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 bg-card/90 backdrop-blur border border-border rounded-lg p-2 shadow-lg">
          {toolbarButtons.map((btn) => (
            <Button
              key={btn.type}
              variant="ghost"
              size="sm"
              className="gap-2 justify-start text-xs h-8"
              onClick={() => handleAddNode(btn.type)}
              title={btn.label}
            >
              <btn.icon className={`h-3.5 w-3.5 ${btn.color}`} />
              {btn.label}
            </Button>
          ))}
        </div>

        {/* Save button */}
        <div className="absolute top-3 right-3 z-10">
          <Button size="sm" className="gap-1.5 shadow-lg" onClick={handleSave} disabled={saving || graphRevision === null}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-background"
          defaultEdgeOptions={{ style: { strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } }}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) => {
              switch (n.type) {
                case "start": return "#10b981";
                case "content": return "#3b82f6";
                case "condition": return "#f59e0b";
                case "menu": return "#a855f7";
                case "action": return "#f43f5e";
                case "flowConnection": return "#14b8a6";
                default: return "#6b7280";
              }
            }}
            maskColor="rgba(0,0,0,0.1)"
            className="!bg-muted/30"
          />
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeEditor
          triggerType={triggerType}
          node={selectedNode}
          onUpdate={handleUpdateNodeData}
          onDelete={handleDeleteNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

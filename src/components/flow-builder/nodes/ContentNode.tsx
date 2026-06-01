import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, Clock, Pause } from "lucide-react";

export function ContentNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[200px] max-w-[280px] shadow-md bg-blue-500/10 border-blue-500 ${selected ? "ring-2 ring-blue-400" : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded bg-blue-500 flex items-center justify-center">
          <MessageSquare className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{nodeData.label || "Conteúdo"}</span>
        {nodeData.wait_for_reply && (
          <span className="ml-auto flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">
            <Pause className="h-2.5 w-2.5" />Aguarda
          </span>
        )}
      </div>
      {nodeData.message && (
        <p className="text-xs text-muted-foreground line-clamp-3 mb-1">{nodeData.message}</p>
      )}
      <div className="flex items-center gap-2">
        {nodeData.delay_minutes > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />{nodeData.delay_minutes} min
          </div>
        )}
        {nodeData.wait_for_reply && nodeData.save_response_as && (
          <div className="text-[10px] text-muted-foreground">
            → salva como <span className="font-mono text-amber-600 dark:text-amber-400">{nodeData.save_response_as}</span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

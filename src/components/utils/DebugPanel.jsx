// E18c-001 / E18c-003
import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// E18c-001: Read-only debug panel, shown only when ?debug=true
export default function DebugPanel({ debugState }) {
  const [expanded, setExpanded] = useState(false);
  const [emailLogs, setEmailLogs] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [llmLogs, setLlmLogs] = useState(null);
  const [loadingLlmLogs, setLoadingLlmLogs] = useState(false);

  // E18c-003: In-memory state transition log — tracked client-side by watching conversationContext
  const [transitionLog, setTransitionLog] = useState([]);
  const prevStateRef = useRef(null);

  useEffect(() => {
    const ctx = debugState?.conversationContext;
    if (!ctx) return;
    const currentState = ctx.state;
    const previousState = ctx.previousState;
    const trigger = ctx.transitionReason;
    if (!currentState) return;
    // Only push when state actually changed compared to last recorded
    if (prevStateRef.current !== currentState) {
      setTransitionLog(log => {
        const entry = {
          from_state: previousState || prevStateRef.current || '—',
          to_state: currentState,
          trigger: trigger || '—',
          timestamp: new Date().toISOString(),
        };
        const updated = [entry, ...log].slice(0, 50); // newest first, max 50
        return updated;
      });
      prevStateRef.current = currentState;
    }
  }, [debugState?.conversationContext?.state, debugState?.conversationContext?.transitionReason]);

  const handleEntityTabSelect = async () => {
    if (emailLogs !== null) return; // already fetched
    setLoadingLogs(true);
    try {
      const logs = await base44.entities.EmailLog.filter({ is_test: true });
      setEmailLogs(logs);
    } catch (e) {
      console.error('[E18c-001] Failed to fetch EmailLog:', e);
      setEmailLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleLlmLogTabSelect = async () => {
    if (llmLogs !== null) return; // already fetched
    setLoadingLlmLogs(true);
    try {
      const conversationId = debugState?.conversationContext?.conversationId;
      const logs = conversationId
        ? await base44.entities.LLMLog.filter({ conversation_id: conversationId }, '-created_date', 100)
        : await base44.entities.LLMLog.list('-created_date', 50);
      setLlmLogs(logs);
    } catch (e) {
      console.error('[WC7] Failed to fetch LLMLog:', e);
      setLlmLogs([]);
    } finally {
      setLoadingLlmLogs(false);
    }
  };

  const sections = [
    { label: 'familyProfile', data: debugState?.familyProfile },
    { label: 'extractedEntities', data: debugState?.extractedEntities },
    { label: 'conversationContext', data: debugState?.conversationContext },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-amber-400 bg-amber-50 shadow-2xl">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-2 bg-amber-400 text-amber-900 font-mono font-bold text-sm hover:bg-amber-500 transition-colors"
      >
        <span>⚠ DEBUG MODE</span>
        <span>{expanded ? '▼' : '▲'}</span>
      </button>

      {expanded && (
        <div className="max-h-96 overflow-hidden flex flex-col">
          <Tabs defaultValue="state" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-2 self-start">
              <TabsTrigger value="state">State Inspector</TabsTrigger>
              <TabsTrigger value="entities" onClick={handleEntityTabSelect}>Entity Viewer</TabsTrigger>
              <TabsTrigger value="llmlog" onClick={handleLlmLogTabSelect}>LLM Log</TabsTrigger>
            </TabsList>

            {/* Tab 1: State Inspector */}
            <TabsContent value="state" className="flex-1 overflow-y-auto p-4 space-y-3">
              {sections.map(({ label, data }) => (
                <CollapsibleSection key={label} label={label} data={data} />
              ))}
              {/* E18c-003: State Transitions */}
              <div className="border border-amber-300 rounded overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-amber-200 text-amber-900 font-mono text-xs font-semibold">
                  <span>stateTransitions ({transitionLog.length})</span>
                </div>
                {transitionLog.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-amber-700 font-mono">No transitions yet — waiting for state changes.</p>
                ) : (
                  <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
                    {transitionLog.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1 border-b border-amber-100 font-mono text-xs hover:bg-amber-50">
                        <span className="text-blue-700 font-bold">{entry.from_state}</span>
                        <span className="text-amber-600">→</span>
                        <span className="text-green-700 font-bold">{entry.to_state}</span>
                        <span className="text-amber-500">({entry.trigger})</span>
                        <span className="ml-auto text-amber-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 2: Entity Viewer */}
            <TabsContent value="entities" className="flex-1 overflow-y-auto p-4">
              {loadingLogs ? (
                <div className="flex items-center gap-2 text-amber-700 text-sm">
                  <div className="animate-spin h-4 w-4 border-2 border-amber-600 border-t-transparent rounded-full" />
                  Loading test email logs...
                </div>
              ) : emailLogs === null ? (
                <p className="text-xs text-amber-700">Click this tab to load EmailLog records where is_test=true.</p>
              ) : emailLogs.length === 0 ? (
                <p className="text-xs text-amber-700">No test email logs found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-amber-200 text-amber-900">
                        {['id', 'type', 'to', 'status', 'test_scenario', 'created_date'].map(col => (
                          <th key={col} className="px-2 py-1 text-left border border-amber-300 font-mono">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {emailLogs.map(log => (
                        <tr key={log.id} className="hover:bg-amber-100">
                          <td className="px-2 py-1 border border-amber-200 font-mono text-xs truncate max-w-20">{log.id?.slice(0, 8)}…</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono">{log.type}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono">{log.to}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono">{log.status}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono">{log.test_scenario || '—'}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono">{log.created_date ? new Date(log.created_date).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            {/* Tab 3: LLM Log */}
            <TabsContent value="llmlog" className="flex-1 overflow-y-auto p-4">
              {loadingLlmLogs ? (
                <div className="flex items-center gap-2 text-amber-700 text-sm">
                  <div className="animate-spin h-4 w-4 border-2 border-amber-600 border-t-transparent rounded-full" />
                  Loading LLM logs...
                </div>
              ) : llmLogs === null ? (
                <p className="text-xs text-amber-700">Click this tab to load LLMLog records for the current conversation.</p>
              ) : llmLogs.length === 0 ? (
                <p className="text-xs text-amber-700">No LLM calls logged for this conversation.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-amber-200 text-amber-900">
                        {['phase', 'model', 'status', 'latency_ms', 'tokens_in', 'tokens_out', 'prompt_summary', 'response_summary', 'timestamp'].map(col => (
                          <th key={col} className="px-2 py-1 text-left border border-amber-300 font-mono whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {llmLogs.map(log => (
                        <tr key={log.id} className="hover:bg-amber-100">
                          <td className="px-2 py-1 border border-amber-200 font-mono">{log.phase}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono max-w-32 truncate">{log.model}</td>
                          <td className={`px-2 py-1 border border-amber-200 font-mono font-bold ${log.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>{log.status}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono text-right">{log.latency_ms}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono text-right">{log.token_count_in}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono text-right">{log.token_count_out}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono max-w-48 truncate" title={log.prompt_summary}>{(log.prompt_summary || '').substring(0, 100)}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono max-w-48 truncate" title={log.response_summary}>{(log.response_summary || '').substring(0, 100)}</td>
                          <td className="px-2 py-1 border border-amber-200 font-mono whitespace-nowrap">{log.created_date ? new Date(log.created_date).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// E18c-001: Collapsible JSON section
function CollapsibleSection({ label, data }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-amber-300 rounded overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-amber-200 text-amber-900 font-mono text-xs font-semibold hover:bg-amber-300 transition-colors"
      >
        <span>{label}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <pre
          className="overflow-auto p-3 text-xs leading-relaxed"
          style={{ background: '#1a1a2e', color: '#c8d3f5', fontFamily: 'monospace', maxHeight: 200 }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
// E18c-001
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// E18c-001: Read-only debug panel, shown only when ?debug=true
export default function DebugPanel({ debugState }) {
  const [expanded, setExpanded] = useState(false);
  const [emailLogs, setEmailLogs] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

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
            </TabsList>

            {/* Tab 1: State Inspector */}
            <TabsContent value="state" className="flex-1 overflow-y-auto p-4 space-y-3">
              {sections.map(({ label, data }) => (
                <CollapsibleSection key={label} label={label} data={data} />
              ))}
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
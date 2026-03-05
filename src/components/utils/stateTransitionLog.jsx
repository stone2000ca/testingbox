// E18c-003: In-memory state transition log (frontend only)
// Max 50 entries, oldest shifted off

const MAX_ENTRIES = 50;
const _log = [];

export function pushStateTransition({ from_state, to_state, trigger }) {
  _log.push({
    from_state: from_state || '—',
    to_state: to_state || '—',
    trigger: trigger || '—',
    timestamp: new Date().toISOString(),
  });
  if (_log.length > MAX_ENTRIES) _log.shift();
}

export function getStateTransitionLog() {
  return [..._log];
}
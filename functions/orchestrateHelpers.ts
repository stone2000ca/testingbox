// Extracted helper functions for orchestrateConversation
// These are inlined when deployed to orchestrateConversation.js via bundling

export async function handleDeepDiveCheck(flags) {
  if (flags?.DEBRIEF_MODE) {
    console.log('[DEEP_DIVE] DEBRIEF_MODE flag is set');
    return true;
  }
  return false;
}
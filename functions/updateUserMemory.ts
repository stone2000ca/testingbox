// Function: updateUserMemory
// Purpose: Persist extracted memory strings as individual UserMemory records with metadata
// Entities: UserMemory
// Last Modified: 2026-03-07
// Dependencies: none

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MAX_MEMORIES = 25;

function detectCategory(content) {
  const lower = content.toLowerCase();
  if (lower.includes('prefer') || lower.includes('want') || lower.includes('looking for') || lower.includes('important')) return 'preference';
  if (lower.includes('child') || lower.includes('grade') || lower.includes('age') || lower.includes('budget') || lower.includes('location')) return 'fact';
  if (lower.includes('feedback') || lower.includes('liked') || lower.includes('disliked') || lower.includes('concern')) return 'feedback';
  return 'context';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memories } = await req.json();

    if (!memories || !Array.isArray(memories)) {
      return Response.json({ error: 'Invalid memories array' }, { status: 400 });
    }

    // Fetch all existing memory records for this user
    const existingRecords = await base44.entities.UserMemory.filter({ userId: user.id });

    // Enforce max cap — if at limit, skip creating new ones
    const currentCount = existingRecords.length;
    let created = 0;
    let updated = 0;

    const now = new Date().toISOString();

    for (const content of memories) {
      if (typeof content !== 'string' || !content.trim()) continue;

      // Check for duplicate by content
      const duplicate = existingRecords.find(m => m.content === content);

      if (duplicate) {
        // Update lastAccessed only
        await base44.entities.UserMemory.update(duplicate.id, { lastAccessed: now });
        updated++;
      } else {
        // Enforce max cap
        if (currentCount + created >= MAX_MEMORIES) continue;

        await base44.entities.UserMemory.create({
          userId: user.id,
          content,
          category: detectCategory(content),
          confidence: 0.8,
          lastAccessed: now,
          source: 'extraction'
        });
        created++;
      }
    }

    return Response.json({ success: true, created, updated });
  } catch (error) {
    console.error('Memory update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
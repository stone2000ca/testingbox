import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memories, deduplicate } = await req.json();

    if (!memories || !Array.isArray(memories)) {
      return Response.json({ error: 'Invalid memories array' }, { status: 400 });
    }

    // Fetch existing memories
    const existing = await base44.entities.UserMemory.filter({ userId: user.id });
    const userMemoryRecord = existing.length > 0 ? existing[0] : null;

    let finalMemories = memories;

    // Deduplication: group by category and keep only the latest value
    if (deduplicate && userMemoryRecord?.memories) {
      const categoryMap = new Map();
      
      // Parse existing memories (format: "category: value")
      userMemoryRecord.memories.forEach(mem => {
        const match = mem.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          const category = match[1].trim();
          categoryMap.set(category, mem);
        }
      });

      // Update/add new memories by category
      finalMemories.forEach(mem => {
        const match = mem.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          const category = match[1].trim();
          categoryMap.set(category, mem); // Replace old value
        }
      });

      // Convert back to array
      finalMemories = Array.from(categoryMap.values());
    } else if (userMemoryRecord?.memories) {
      // If not deduplicating, append new to existing
      const allMemories = [...userMemoryRecord.memories, ...memories];
      const uniqueMemories = [...new Set(allMemories)];
      finalMemories = uniqueMemories.slice(0, 10); // Max 10
    }

    // Enforce max 10 entries
    if (finalMemories.length > 10) {
      finalMemories = finalMemories.slice(0, 10);
    }

    // Update or create UserMemory record
    if (userMemoryRecord) {
      await base44.entities.UserMemory.update(userMemoryRecord.id, {
        memories: finalMemories,
        lastUpdated: new Date().toISOString()
      });
    } else {
      await base44.entities.UserMemory.create({
        userId: user.id,
        memories: finalMemories,
        lastUpdated: new Date().toISOString()
      });
    }

    return Response.json({ success: true, memories: finalMemories });
  } catch (error) {
    console.error('Memory update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Save, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { base44 } from '@/api/base44Client';

export default function NotesPanel({ userId, onClose }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [memories, setMemories] = useState([]);

  useEffect(() => {
    loadNotes();
    loadMemories();
  }, [userId]);

  const loadNotes = async () => {
    try {
      const userNotes = await base44.entities.Notes.filter({ userId });
      setNotes(userNotes);
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  };

  const loadMemories = async () => {
    try {
      const userMemories = await base44.entities.UserMemory.filter({ userId });
      if (userMemories.length > 0) {
        setMemories(userMemories[0].memories || []);
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      await base44.entities.Notes.create({
        userId,
        content: newNote
      });
      setNewNote('');
      loadNotes();
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await base44.entities.Notes.delete(noteId);
      loadNotes();
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleEditNote = async (noteId) => {
    try {
      await base44.entities.Notes.update(noteId, { content: editContent });
      setEditingId(null);
      loadNotes();
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold">My Notes</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* User Notes Section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Your Notes</h3>
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="bg-slate-50 rounded-lg p-3">
                  {editingId === note.id ? (
                    <>
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="mb-2 text-sm"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleEditNote(note.id)}>
                          <Save className="w-3 h-3 mr-1" />
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-700 mb-2">{note.content}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">
                          {new Date(note.created_date).toLocaleDateString()}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(note.id);
                              setEditContent(note.content);
                            }}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* AI Memories Section */}
          {memories.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-semibold text-slate-700">AI Memories</h3>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-100">
                <ul className="space-y-2">
                  {memories.map((memory, index) => (
                    <li key={index} className="text-sm text-slate-700 flex items-start gap-2">
                      <span className="text-purple-500 mt-1">•</span>
                      <span>{memory}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-slate-200">
        <Textarea
          placeholder="Add a new note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="mb-2"
          rows={3}
        />
        <Button onClick={handleAddNote} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Add Note
        </Button>
      </div>
    </div>
  );
}
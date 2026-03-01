import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock, Calendar, Plus, Sparkles, X, Edit2, Trash2 } from 'lucide-react';

const BLANK_EVENT = {
  eventType: 'open_house',
  title: '',
  date: '',
  endDate: '',
  description: '',
  registrationUrl: '',
  virtualUrl: '',
  capacity: '',
  location: '',
};

export default function EventsSection({ school }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(BLANK_EVENT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (school?.id) {
      base44.entities.SchoolEvent.filter({ schoolId: school.id })
        .then(setEvents)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [school?.id]);

  const openForm = (event = null) => {
    if (event) {
      setFormData(event);
      setEditingId(event.id);
    } else {
      setFormData(BLANK_EVENT);
      setEditingId(null);
    }
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormData(BLANK_EVENT);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.date) {
      alert('Title and date are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        schoolId: school.id,
        eventType: formData.eventType,
        title: formData.title,
        date: formData.date,
        endDate: formData.endDate || null,
        description: formData.description,
        registrationUrl: formData.registrationUrl || null,
        virtualUrl: formData.virtualUrl || null,
        capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
        location: formData.location || null,
        source: 'school_portal',
        isConfirmed: true,
        isActive: true,
      };

      if (editingId) {
        await base44.entities.SchoolEvent.update(editingId, payload);
        setEvents(events.map(e => e.id === editingId ? { ...e, ...payload } : e));
      } else {
        const newEvent = await base44.entities.SchoolEvent.create(payload);
        setEvents([...events, newEvent]);
      }
      closeForm();
    } catch (error) {
      console.error('Failed to save event:', error);
      alert('Failed to save event.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventId) => {
    if (!confirm('Delete this event?')) return;
    try {
      await base44.entities.SchoolEvent.delete(eventId);
      setEvents(events.filter(e => e.id !== eventId));
    } catch (error) {
      console.error('Failed to delete event:', error);
      alert('Failed to delete event.');
    }
  };

  const isPremium = school.subscriptionTier === 'premium';
  const aiEnrichedEvents = events.filter(e => e.source === 'ai_enriched');

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Events & Open Houses</h2>
          <p className="text-sm text-slate-500 mt-1">Manage school events and open house dates.</p>
        </div>
      </div>

      {!isPremium ? (
        <div className="space-y-4">
          {/* Locked Teaser Card */}
          <div className="border-2 border-amber-200 rounded-xl p-6 bg-gradient-to-br from-amber-50 to-orange-50">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Lock className="h-6 w-6 text-amber-700" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-2">Events Management Unlocked in Premium</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Upgrade to Premium to create, edit, and manage your school's events. Help families discover your open houses, tours, and information sessions.
                </p>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                    Create and edit unlimited events
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                    Manage registration and virtual event links
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                    Track event attendance and engagement
                  </div>
                </div>
                <Button className="bg-amber-600 hover:bg-amber-700">Upgrade to Premium</Button>
              </div>
            </div>
          </div>

          {/* Social Proof: AI-Enriched Events */}
          {aiEnrichedEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-teal-600" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">AI-Generated Examples (Read-Only)</p>
              </div>
              <div className="space-y-3">
                {aiEnrichedEvents.map((event) => (
                  <div key={event.id} className="border rounded-lg p-4 bg-white opacity-75">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-900">{event.title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{event.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Premium: Events Management */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Your Events</h3>
            <Button size="sm" className="gap-2" onClick={() => openForm()}>
              <Plus className="h-4 w-4" />
              Add Event
            </Button>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
              <Calendar className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No events yet.</p>
              <button onClick={() => openForm()} className="mt-2 text-teal-600 text-sm font-medium hover:underline">
                Create your first event
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="border rounded-lg p-4 bg-white hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded font-semibold">
                          {event.eventType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </span>
                      </div>
                      <h4 className="font-semibold text-slate-900">{event.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {event.location && ` • ${event.location}`}
                      </p>
                      {event.description && (
                        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{event.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openForm(event)} className="h-8 w-8 p-0">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(event.id)} className="h-8 w-8 p-0 text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form Modal */}
          {showForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">
                    {editingId ? 'Edit Event' : 'Create Event'}
                  </h3>
                  <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold">Event Type *</Label>
                      <Select value={formData.eventType} onValueChange={(v) => setFormData({ ...formData, eventType: v, virtualUrl: v === 'virtual_tour' || v === 'info_session' ? formData.virtualUrl : '' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open_house">Open House</SelectItem>
                          <SelectItem value="campus_tour">Campus Tour</SelectItem>
                          <SelectItem value="virtual_tour">Virtual Tour</SelectItem>
                          <SelectItem value="info_session">Info Session</SelectItem>
                          <SelectItem value="shadow_day">Shadow Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Title *</Label>
                      <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Spring Open House" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold">Start Date & Time *</Label>
                      <Input type="datetime-local" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">End Date & Time (optional)</Label>
                      <Input type="datetime-local" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Description</Label>
                    <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} placeholder="Tell families about this event..." />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold">Registration URL (optional)</Label>
                      <Input type="url" value={formData.registrationUrl} onChange={(e) => setFormData({ ...formData, registrationUrl: e.target.value })} placeholder="https://..." />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Capacity (optional)</Label>
                      <Input type="number" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} placeholder="e.g. 50" min="0" />
                    </div>
                  </div>

                  {(formData.eventType === 'virtual_tour' || formData.eventType === 'info_session') && (
                    <div>
                      <Label className="text-xs font-semibold">Virtual Event URL (optional)</Label>
                      <Input type="url" value={formData.virtualUrl} onChange={(e) => setFormData({ ...formData, virtualUrl: e.target.value })} placeholder="Zoom, Teams, or other meeting link..." />
                    </div>
                  )}

                  <div>
                    <Label className="text-xs font-semibold">Location (optional)</Label>
                    <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Leave blank for main campus" />
                  </div>

                  <div className="flex gap-2 justify-end pt-4 border-t">
                    <Button variant="outline" onClick={closeForm}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
                      {saving ? 'Saving...' : editingId ? 'Update Event' : 'Create Event'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Crown, Plus, Pencil, Trash2, Calendar, Link, Video, Users, RefreshCw, MapPin } from 'lucide-react';
import { createPageUrl } from '@/utils';

const EVENT_TYPE_LABELS = {
  open_house: 'Open House',
  campus_tour: 'Campus Tour',
  virtual_tour: 'Virtual Tour',
  info_session: 'Info Session',
  shadow_day: 'Shadow Day',
};

const EVENT_TYPE_COLORS = {
  open_house: 'bg-teal-100 text-teal-700',
  campus_tour: 'bg-blue-100 text-blue-700',
  virtual_tour: 'bg-purple-100 text-purple-700',
  info_session: 'bg-amber-100 text-amber-700',
  shadow_day: 'bg-rose-100 text-rose-700',
};

const EMPTY_FORM = {
  eventType: '',
  title: '',
  date: '',
  endDate: '',
  description: '',
  registrationUrl: '',
  virtualUrl: '',
  capacity: '',
  location: '',
  isRecurring: false,
  recurrenceRule: '',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ─── FREE TIER TEASER ────────────────────────────────────────────────────────

function FreeTierTeaser({ school }) {
  const [aiEvents, setAiEvents] = useState([]);

  useEffect(() => {
    base44.entities.SchoolEvent.filter({ schoolId: school.id, source: 'ai_enriched' })
      .then(setAiEvents)
      .catch(() => {});
  }, [school.id]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl">📅</div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Events & Open Houses</h2>
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full mt-1">
              <Crown className="h-3 w-3" /> Premium
            </span>
          </div>
        </div>

        <p className="text-slate-600 mb-5">
          Parents searching NextSchool actively look for schools with upcoming events. Add your open houses and tours to get discovered.
        </p>

        <ul className="space-y-2 mb-6">
          {[
            'Publish open houses and tours',
            'Receive tour requests with family context',
            'See how many parents viewed your events',
          ].map(item => (
            <li key={item} className="flex items-center gap-2 text-slate-700 text-sm">
              <span className="h-2 w-2 rounded-full bg-teal-500 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>

        {aiEvents.length > 0 && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6">
            <p className="text-sm font-semibold text-slate-700 mb-3">
              🔍 We found {aiEvents.length} event{aiEvents.length > 1 ? 's' : ''} on your website. Upgrade to confirm and manage.
            </p>
            <div className="space-y-2">
              {aiEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 text-sm text-slate-500">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${EVENT_TYPE_COLORS[ev.eventType] || 'bg-slate-100 text-slate-600'}`}>
                    {EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}
                  </span>
                  <span>{ev.title}</span>
                  {ev.date && <span className="text-slate-400">{formatDate(ev.date)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <a href={createPageUrl('Pricing')}>
          <Button className="bg-amber-500 hover:bg-amber-600 text-white gap-2">
            <Crown className="h-4 w-4" />
            Upgrade to Premium
          </Button>
        </a>
      </div>
    </div>
  );
}

// ─── EVENT FORM MODAL ────────────────────────────────────────────────────────

function EventFormModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        ...EMPTY_FORM,
        ...initial,
        capacity: initial.capacity ?? '',
        endDate: initial.endDate ?? '',
        recurrenceRule: initial.recurrenceRule ?? '',
        registrationUrl: initial.registrationUrl ?? '',
        virtualUrl: initial.virtualUrl ?? '',
        description: initial.description ?? '',
        location: initial.location ?? '',
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.eventType || !form.title || !form.date) return;
    setSaving(true);
    await onSave({
      ...form,
      capacity: form.capacity !== '' ? Number(form.capacity) : null,
      endDate: form.endDate || null,
      recurrenceRule: form.recurrenceRule || null,
      registrationUrl: form.registrationUrl || null,
      virtualUrl: form.virtualUrl || null,
      description: form.description || null,
      location: form.location || null,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Event' : 'Add Event'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Event Type *</Label>
            <Select value={form.eventType} onValueChange={v => set('eventType', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select type…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Title *</Label>
            <Input className="mt-1" placeholder="e.g. Fall Open House 2026" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date & Time *</Label>
              <Input className="mt-1" type="datetime-local" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <Label>End Date & Time</Label>
              <Input className="mt-1" type="datetime-local" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea className="mt-1" placeholder="What should families expect?" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div>
            <Label className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Location / Venue</Label>
            <Input className="mt-1" placeholder="e.g. Main Hall, Building A" value={form.location} onChange={e => set('location', e.target.value)} />
          </div>

          <div>
            <Label className="flex items-center gap-1"><Link className="h-3 w-3" /> Registration URL</Label>
            <Input className="mt-1" type="url" placeholder="https://…" value={form.registrationUrl} onChange={e => set('registrationUrl', e.target.value)} />
          </div>

          <div>
            <Label className="flex items-center gap-1"><Video className="h-3 w-3" /> Virtual / Zoom URL</Label>
            <Input className="mt-1" type="url" placeholder="https://zoom.us/…" value={form.virtualUrl} onChange={e => set('virtualUrl', e.target.value)} />
          </div>

          <div>
            <Label className="flex items-center gap-1"><Users className="h-3 w-3" /> Capacity</Label>
            <Input className="mt-1" type="number" min="0" placeholder="Leave blank if unlimited" value={form.capacity} onChange={e => set('capacity', e.target.value)} />
          </div>

          <div className="flex items-center justify-between border rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <RefreshCw className="h-4 w-4" /> Recurring event
            </div>
            <Switch checked={form.isRecurring} onCheckedChange={v => set('isRecurring', v)} />
          </div>

          {form.isRecurring && (
            <div>
              <Label>Recurrence Rule</Label>
              <Input className="mt-1" placeholder="e.g. Every Tuesday 10am Sept-Nov" value={form.recurrenceRule} onChange={e => set('recurrenceRule', e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.eventType || !form.title || !form.date}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PREMIUM EVENTS MANAGEMENT ───────────────────────────────────────────────

function PremiumEventsManagement({ school }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadEvents = async () => {
    setLoading(true);
    const data = await base44.entities.SchoolEvent.filter({ schoolId: school.id });
    setEvents(data.sort((a, b) => new Date(a.date) - new Date(b.date)));
    setLoading(false);
  };

  useEffect(() => { loadEvents(); }, [school.id]);

  const handleSave = async (formData) => {
    if (editing) {
      await base44.entities.SchoolEvent.update(editing.id, { ...formData, source: 'school_portal', isConfirmed: true });
    } else {
      await base44.entities.SchoolEvent.create({ ...formData, schoolId: school.id, source: 'school_portal', isConfirmed: true, isActive: true });
    }
    setEditing(null);
    await loadEvents();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return;
    await base44.entities.SchoolEvent.delete(id);
    await loadEvents();
  };

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (ev) => { setEditing(ev); setModalOpen(true); };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Events & Open Houses</h2>
          <p className="text-sm text-slate-500 mt-1">Manage your school events — published to NextSchool parent search</p>
        </div>
        <Button onClick={openAdd} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
          <Plus className="h-4 w-4" /> Add Event
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-4 border-teal-600 border-t-transparent rounded-full" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No events yet</p>
          <p className="text-sm mt-1">Add your first open house or tour to get discovered by parents.</p>
          <Button onClick={openAdd} variant="outline" className="mt-4 gap-2">
            <Plus className="h-4 w-4" /> Add Event
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => (
            <div key={ev.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${EVENT_TYPE_COLORS[ev.eventType] || 'bg-slate-100 text-slate-600'}`}>
                    {EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}
                  </span>
                  {ev.isRecurring && (
                    <span className="flex items-center gap-1 text-xs text-slate-500"><RefreshCw className="h-3 w-3" /> Recurring</span>
                  )}
                  {!ev.isActive && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                <p className="font-semibold text-slate-900">{ev.title}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {formatDate(ev.date)}{ev.endDate ? ` → ${formatDate(ev.endDate)}` : ''}
                </p>
                {ev.description && (
                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">{ev.description}</p>
                )}
                {ev.location && (
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEdit(ev)} className="text-slate-500 hover:text-slate-900">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(ev.id)} className="text-slate-500 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EventFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  );
}

// ─── DEFAULT EXPORT ───────────────────────────────────────────────────────────

export default function EventsSection({ school }) {
  const isPremium = school.subscriptionTier === 'premium';
  return isPremium
    ? <PremiumEventsManagement school={school} />
    : <FreeTierTeaser school={school} />;
}
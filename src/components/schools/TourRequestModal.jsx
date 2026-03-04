import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X, CheckCircle2, CalendarDays } from 'lucide-react';
import { EVENT_TYPE_LABELS } from '@/components/utils/eventConstants';

export default function TourRequestModal({ school, onClose, upcomingEvents = [] }) {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    tourType: 'in_person',
    preferredDateOption: '',   // event ID or 'other'
    otherDate: '',
    altDateOption: '',
    altOtherDate: '',
    numberOfVisitors: 2,
    childGrade: '',
    specialRequests: '',
  });
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setForm(f => ({ ...f, childGrade: u?.childGrade ?? '' }));
    }).catch(() => {});
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const resolveDate = (option, otherVal) => {
    if (!option || option === '') return null;
    if (option === 'other') return otherVal || null;
    const ev = upcomingEvents.find(e => e.id === option);
    return ev?.date || null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSending(true);

    const preferredDate = resolveDate(form.preferredDateOption, form.otherDate);
    const preferredDateAlt = resolveDate(form.altDateOption, form.altOtherDate);
    const primaryEvent = upcomingEvents.find(e => e.id === form.preferredDateOption);

    const messageParts = [
      `Tour request for ${school.name}`,
      `Tour type: ${form.tourType === 'in_person' ? 'In-Person' : 'Virtual'}`,
      preferredDate ? `Preferred date: ${new Date(preferredDate).toLocaleString('en-CA')}` : null,
      preferredDateAlt ? `Alternative date: ${new Date(preferredDateAlt).toLocaleString('en-CA')}` : null,
      `Visitors: ${form.numberOfVisitors}`,
      form.childGrade !== '' ? `Child's grade: ${form.childGrade}` : null,
      form.specialRequests ? `Special requests: ${form.specialRequests}` : null,
    ].filter(Boolean).join('\n');

    await base44.entities.SchoolInquiry.create({
      parentUserId: user.id,
      schoolId: school.id,
      inquiryType: 'tour_request',
      message: messageParts,
      status: 'pending',
      parentName: user.full_name || '',
      parentEmail: user.email || '',
      tourType: form.tourType,
      preferredDate: preferredDate || undefined,
      preferredDateAlt: preferredDateAlt || undefined,
      eventId: primaryEvent?.id || undefined,
      numberOfVisitors: Number(form.numberOfVisitors),
      childGrade: form.childGrade !== '' ? Number(form.childGrade) : undefined,
      specialRequests: form.specialRequests || undefined,
    });

    setSending(false);
    setSuccess(true);
    setTimeout(() => onClose(), 2500);
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center">
          <div className="h-16 w-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-teal-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Tour Request Sent!</h3>
          <p className="text-slate-600">{school.name}'s admissions team will be in touch within 2–3 business days.</p>
        </div>
      </div>
    );
  }

  const dateOptions = upcomingEvents.map(ev => ({
    value: ev.id,
    label: `${EVENT_TYPE_LABELS[ev.eventType] || ev.eventType} — ${new Date(ev.date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}`,
  }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Request a Tour</h3>
            <p className="text-sm text-slate-500">{school.name}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Tour type */}
          <div>
            <Label className="mb-2 block">Tour Type *</Label>
            <div className="flex gap-3">
              {[{ val: 'in_person', label: 'In-Person' }, { val: 'virtual', label: 'Virtual' }].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => set('tourType', opt.val)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.tourType === opt.val
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'border-slate-200 text-slate-700 hover:border-teal-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred date */}
          <div>
            <Label className="mb-2 block flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Preferred Date
            </Label>
            <select
              value={form.preferredDateOption}
              onChange={e => set('preferredDateOption', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white"
            >
              <option value="">— Select a date —</option>
              {dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              <option value="other">Other date…</option>
            </select>
            {form.preferredDateOption === 'other' && (
              <Input
                type="datetime-local"
                value={form.otherDate}
                onChange={e => set('otherDate', e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Alternative date */}
          <div>
            <Label className="mb-2 block text-slate-600 text-xs">Alternative Date (optional)</Label>
            <select
              value={form.altDateOption}
              onChange={e => set('altDateOption', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white"
            >
              <option value="">— None —</option>
              {dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              <option value="other">Other date…</option>
            </select>
            {form.altDateOption === 'other' && (
              <Input
                type="datetime-local"
                value={form.altOtherDate}
                onChange={e => set('altOtherDate', e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Visitors + grade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Number of Visitors</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.numberOfVisitors}
                onChange={e => set('numberOfVisitors', e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">Child's Grade</Label>
              <Input
                type="number"
                placeholder="e.g. 5"
                value={form.childGrade}
                onChange={e => set('childGrade', e.target.value)}
              />
            </div>
          </div>

          {/* Special requests */}
          <div>
            <Label className="mb-1 block">Special Requests or Questions</Label>
            <Textarea
              rows={3}
              value={form.specialRequests}
              onChange={e => set('specialRequests', e.target.value)}
              placeholder="Accessibility needs, specific questions, anything else…"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={sending || !user} className="flex-1 bg-teal-600 hover:bg-teal-700">
              {sending ? 'Sending…' : 'Send Tour Request'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
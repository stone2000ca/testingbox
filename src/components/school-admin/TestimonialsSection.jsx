import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';

const BLANK = { author_first_name: '', author_role: 'parent', quote_text: '', year: '', is_visible: true };

export default function TestimonialsSection({ school }) {
  const [testimonials, setTestimonials] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (school?.id) {
      base44.entities.Testimonial.filter({ school_id: school.id })
        .then(setTestimonials)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [school?.id]);

  const add = () => {
    if (testimonials.length >= 5) return;
    setTestimonials([...testimonials, { ...BLANK, _localId: Date.now() }]);
  };

  const update = (idx, field, value) => {
    setTestimonials(testimonials.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const remove = async (idx) => {
    const t = testimonials[idx];
    if (t.id) await base44.entities.Testimonial.delete(t.id);
    setTestimonials(testimonials.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    setSaving(true);
    const updated = [];
    for (const t of testimonials) {
      const payload = {
        school_id: school.id,
        author_first_name: t.author_first_name.slice(0, 50),
        author_role: t.author_role,
        quote_text: t.quote_text.slice(0, 500),
        year: t.year ? t.year.slice(0, 4) : '',
        is_visible: t.is_visible !== false,
      };
      if (t.id) {
        updated.push(await base44.entities.Testimonial.update(t.id, payload));
      } else {
        updated.push(await base44.entities.Testimonial.create(payload));
      }
    }
    setTestimonials(updated);
    setSaving(false);
  };

  if (loading) {
    return <div className="py-12 flex justify-center"><div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Testimonials</h2>
          <p className="text-sm text-slate-500 mt-1">Add up to 5 testimonials from parents, students, or alumni.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={saveAll} disabled={saving || testimonials.length === 0}>
            {saving ? 'Saving...' : 'Save All'}
          </Button>
          {testimonials.length < 5 && (
            <Button size="sm" onClick={add}>+ Add Testimonial</Button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-4">{testimonials.length}/5 testimonials</p>

      <div className="space-y-4">
        {testimonials.map((t, idx) => (
          <div key={t.id || t._localId || idx} className="border rounded-xl p-4 bg-slate-50 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Testimonial {idx + 1}</span>
              <button type="button" onClick={() => remove(idx)} className="text-slate-400 hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First Name</Label>
                <Input value={t.author_first_name} maxLength={50} onChange={(e) => update(idx, 'author_first_name', e.target.value)} placeholder="e.g. Sarah" />
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={t.author_role} onValueChange={(v) => update(idx, 'author_role', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="alumni">Alumni</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="flex justify-between">
                <Label className="text-xs">Quote</Label>
                <span className={`text-xs ${t.quote_text.length > 480 ? 'text-red-500' : 'text-slate-400'}`}>{t.quote_text.length}/500</span>
              </div>
              <Textarea value={t.quote_text} maxLength={500} rows={3} onChange={(e) => update(idx, 'quote_text', e.target.value)} placeholder="Share what makes this school special..." />
            </div>
            <div className="w-24">
              <Label className="text-xs">Year (optional)</Label>
              <Input value={t.year || ''} maxLength={4} onChange={(e) => update(idx, 'year', e.target.value)} placeholder="2024" />
            </div>
          </div>
        ))}

        {testimonials.length === 0 && (
          <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
            <p className="text-sm">No testimonials yet.</p>
            <button onClick={add} className="mt-2 text-teal-600 text-sm font-medium hover:underline">Add your first testimonial</button>
          </div>
        )}
      </div>
    </div>
  );
}
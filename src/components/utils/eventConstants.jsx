export const EVENT_TYPE_LABELS = {
  open_house: 'Open House',
  campus_tour: 'Campus Tour',
  virtual_tour: 'Virtual Tour',
  info_session: 'Info Session',
  shadow_day: 'Shadow Day',
};

export const EVENT_TYPE_COLORS = {
  open_house: 'bg-teal-100 text-teal-700',
  campus_tour: 'bg-blue-100 text-blue-700',
  virtual_tour: 'bg-purple-100 text-purple-700',
  info_session: 'bg-amber-100 text-amber-700',
  shadow_day: 'bg-rose-100 text-rose-700',
};

export function formatEventDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
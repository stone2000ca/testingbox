import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Mail, Send, Clock, CheckCircle2, XCircle, CalendarDays, User, BookOpen } from 'lucide-react';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatGrade(grade) {
  if (grade === null || grade === undefined) return null;
  const n = Number(grade);
  if (n <= -2) return 'Pre-K';
  if (n === -1) return 'JK';
  if (n === 0) return 'K';
  return `Grade ${n}`;
}

// ─── TOUR STATUS CONFIG ───────────────────────────────────────────────────────

const TOUR_STATUS_CONFIG = {
  new:       { label: 'New',       color: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700' },
  scheduled: { label: 'Scheduled', color: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-600' },
};

const TOUR_STATUS_ORDER = ['new', 'contacted', 'scheduled', 'completed'];

// ─── GENERAL INQUIRY STATUS CONFIG ────────────────────────────────────────────

const GENERAL_STATUS_CONFIG = {
  pending:   { icon: Clock,         color: 'bg-amber-100 text-amber-700',  label: 'Pending' },
  responded: { icon: CheckCircle2,  color: 'bg-green-100 text-green-700',  label: 'Responded' },
  closed:    { icon: XCircle,       color: 'bg-slate-100 text-slate-700',  label: 'Closed' },
};

// ─── TOUR REQUEST CARD ────────────────────────────────────────────────────────

function TourRequestCard({ inquiry, onTourStatusChange }) {
  const tourStatus = inquiry.tourStatus || 'new';
  const cfg = TOUR_STATUS_CONFIG[tourStatus] || TOUR_STATUS_CONFIG.new;
  const [updating, setUpdating] = useState(false);

  const handleStatusChange = async (newStatus) => {
    setUpdating(true);
    await onTourStatusChange(inquiry.id, newStatus);
    setUpdating(false);
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Badge className="bg-teal-100 text-teal-700 font-semibold">Tour Request</Badge>
          <Badge className={cfg.color}>{cfg.label}</Badge>
          <span className="ml-auto text-xs text-slate-400">{formatDate(inquiry.created_date)}</span>
        </div>

        {/* Parent info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
          {inquiry.parentName && (
            <div className="flex items-center gap-2 text-slate-700">
              <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <span className="font-medium">{inquiry.parentName}</span>
            </div>
          )}
          {inquiry.parentEmail && (
            <div className="flex items-center gap-2 text-slate-700">
              <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <a href={`mailto:${inquiry.parentEmail}`} className="text-teal-600 hover:underline truncate">
                {inquiry.parentEmail}
              </a>
            </div>
          )}
          {inquiry.childGrade != null && (
            <div className="flex items-center gap-2 text-slate-700">
              <BookOpen className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <span>{formatGrade(inquiry.childGrade)}</span>
            </div>
          )}
          {inquiry.tourType && (
            <div className="flex items-center gap-2 text-slate-700">
              <CalendarDays className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <span>{inquiry.tourType === 'in_person' ? 'In-Person Tour' : 'Virtual Tour'}</span>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="space-y-1 text-sm mb-4">
          {inquiry.preferredDate && (
            <div className="flex gap-2">
              <span className="text-slate-500 w-32 flex-shrink-0">Preferred date:</span>
              <span className="text-slate-800 font-medium">{formatDate(inquiry.preferredDate)}</span>
            </div>
          )}
          {inquiry.preferredDateAlt && (
            <div className="flex gap-2">
              <span className="text-slate-500 w-32 flex-shrink-0">Alternative date:</span>
              <span className="text-slate-800">{formatDate(inquiry.preferredDateAlt)}</span>
            </div>
          )}
          {inquiry.numberOfVisitors && (
            <div className="flex gap-2">
              <span className="text-slate-500 w-32 flex-shrink-0">Visitors:</span>
              <span className="text-slate-800">{inquiry.numberOfVisitors}</span>
            </div>
          )}
        </div>

        {/* Special requests */}
        {inquiry.specialRequests && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 mb-4 border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-1">Special Requests</p>
            <p className="whitespace-pre-wrap">{inquiry.specialRequests}</p>
          </div>
        )}

        {/* Status changer */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Update status:</span>
          {TOUR_STATUS_ORDER.map(s => (
            <button
              key={s}
              disabled={tourStatus === s || updating}
              onClick={() => handleStatusChange(s)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                tourStatus === s
                  ? `${TOUR_STATUS_CONFIG[s].color} border-transparent cursor-default`
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50'
              }`}
            >
              {TOUR_STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ─── GENERAL INQUIRY CARD ─────────────────────────────────────────────────────

function GeneralInquiryCard({ inquiry, expandedId, onToggleExpand, responses, onResponseChange, onSendResponse, onCloseInquiry }) {
  const statusCfg = GENERAL_STATUS_CONFIG[inquiry.status] || GENERAL_STATUS_CONFIG.pending;
  const Icon = statusCfg.icon;
  const isExpanded = expandedId === inquiry.id;

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => onToggleExpand(inquiry.id)}
        className="w-full p-5 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900 text-sm">Parent Inquiry</h3>
            {inquiry.parentName && <span className="text-sm text-slate-500">— {inquiry.parentName}</span>}
            <Badge className={statusCfg.color}>
              <Icon className="h-3 w-3 mr-1" />
              {statusCfg.label}
            </Badge>
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0 ml-2">{formatDate(inquiry.created_date)}</span>
        </div>
        <p className="text-slate-700 text-sm line-clamp-2">{inquiry.message}</p>
      </button>

      {isExpanded && (
        <div className="border-t p-5 bg-slate-50">
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Message</h4>
            <p className="text-slate-900 whitespace-pre-wrap text-sm">{inquiry.message}</p>
          </div>

          {inquiry.response && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Your Response</h4>
              <p className="text-slate-900 whitespace-pre-wrap bg-white p-4 rounded-lg border text-sm">
                {inquiry.response}
              </p>
            </div>
          )}

          {inquiry.status === 'pending' && (
            <div className="space-y-3">
              <Textarea
                value={responses[inquiry.id] || ''}
                onChange={(e) => onResponseChange(inquiry.id, e.target.value)}
                placeholder="Type your response here..."
                rows={4}
                className="bg-white"
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => onSendResponse(inquiry.id)}
                  disabled={!responses[inquiry.id]?.trim()}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Response
                </Button>
                <Button variant="outline" onClick={() => onCloseInquiry(inquiry.id)}>
                  Mark as Closed
                </Button>
              </div>
            </div>
          )}

          {inquiry.status === 'responded' && (
            <Button variant="outline" onClick={() => onCloseInquiry(inquiry.id)}>
              Mark as Closed
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export { TOUR_STATUS_CONFIG };

export default function Inquiries({ schoolId }) {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [responses, setResponses] = useState({});

  useEffect(() => {
    loadInquiries();
  }, [schoolId]);

  const loadInquiries = async () => {
    try {
      const data = await base44.entities.SchoolInquiry.filter({ schoolId });
      setInquiries(data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    } catch (error) {
      console.error('Failed to load inquiries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendResponse = async (inquiryId) => {
    const responseText = responses[inquiryId];
    if (!responseText?.trim()) return;
    await base44.entities.SchoolInquiry.update(inquiryId, { response: responseText, status: 'responded' });
    setInquiries(inquiries.map(inq =>
      inq.id === inquiryId ? { ...inq, response: responseText, status: 'responded' } : inq
    ));
    setResponses({ ...responses, [inquiryId]: '' });
    setExpandedId(null);
  };

  const handleCloseInquiry = async (inquiryId) => {
    await base44.entities.SchoolInquiry.update(inquiryId, { status: 'closed' });
    setInquiries(inquiries.map(inq => inq.id === inquiryId ? { ...inq, status: 'closed' } : inq));
  };

  const handleTourStatusChange = async (inquiryId, newStatus) => {
    await base44.entities.SchoolInquiry.update(inquiryId, { tourStatus: newStatus });
    setInquiries(inquiries.map(inq => inq.id === inquiryId ? { ...inq, tourStatus: newStatus } : inq));
  };

  // Tab filtering
  const filtered = inquiries.filter(inq => {
    if (activeTab === 'tour') return inq.inquiryType === 'tour_request';
    if (activeTab === 'general') return inq.inquiryType !== 'tour_request';
    return true;
  });

  const tourCount = inquiries.filter(i => i.inquiryType === 'tour_request').length;
  const generalCount = inquiries.filter(i => i.inquiryType !== 'tour_request').length;
  const newTourCount = inquiries.filter(i => i.inquiryType === 'tour_request' && (!i.tourStatus || i.tourStatus === 'new')).length;

  const tabs = [
    { id: 'all',     label: 'All',           count: inquiries.length },
    { id: 'tour',    label: 'Tour Requests',  count: tourCount,   badge: newTourCount },
    { id: 'general', label: 'General',        count: generalCount },
  ];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Parent Inquiries</h2>
        <p className="text-slate-600">Manage messages from prospective families</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.id ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
            {tab.badge > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-semibold">
                {tab.badge} new
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Mail className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No inquiries yet</h3>
          <p className="text-slate-600">When parents contact your school, their messages will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((inquiry) =>
            inquiry.inquiryType === 'tour_request' ? (
              <TourRequestCard
                key={inquiry.id}
                inquiry={inquiry}
                onTourStatusChange={handleTourStatusChange}
              />
            ) : (
              <GeneralInquiryCard
                key={inquiry.id}
                inquiry={inquiry}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                responses={responses}
                onResponseChange={(id, val) => setResponses({ ...responses, [id]: val })}
                onSendResponse={handleSendResponse}
                onCloseInquiry={handleCloseInquiry}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
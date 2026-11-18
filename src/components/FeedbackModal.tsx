import React, { useEffect, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import {
  listFeedback,
  submitFeedback,
  type FeedbackCategory,
  type FeedbackSubmission,
} from '../data/platformStore';

const CATEGORIES: FeedbackCategory[] = [
  'Feature Request',
  'Physics & Kinematics',
  'UI / Workflow',
  'Bug Report',
];

interface FeedbackModalProps {
  open: boolean;
  userId: string | null;
  userEmail: string;
  appView: 'landing' | 'simulator';
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  open,
  userId,
  userEmail,
  appView,
  onClose,
}) => {
  const [category, setCategory] = useState<FeedbackCategory>('Feature Request');
  const [rating, setRating] = useState(5);
  const [email, setEmail] = useState(userEmail);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedNotice, setSubmittedNotice] = useState(false);
  const [history, setHistory] = useState<FeedbackSubmission[]>([]);

  useEffect(() => {
    if (open) {
      setEmail(userEmail);
      setHistory(listFeedback());
      setError(null);
      setSubmittedNotice(false);
    }
  }, [open, userEmail]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmittedNotice(false);
    setSubmitting(true);
    try {
      const res = await submitFeedback({
        userId,
        email,
        category,
        rating,
        message,
        appView,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage('');
      setSubmittedNotice(true);
      setHistory(listFeedback());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AxisLab Product Feedback Menu"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-lg border border-white/15 bg-[#141820] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <MessageSquare className="h-4 w-4 text-amber-400" />
            <span>Feedback Menu</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Feedback Modal"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs" noValidate>
          <div className="space-y-1.5">
            <span className="block font-medium text-slate-300">Category</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded border px-2 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    category === cat
                      ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                      : 'border-white/10 bg-[#0d1015] text-slate-300 hover:bg-[#1a202b]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="block font-medium text-slate-300">
                Experience Rating (1–5)
              </span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    aria-label={`Rate ${num} out of 5`}
                    aria-pressed={rating === num}
                    onClick={() => setRating(num)}
                    className={`h-8 flex-1 rounded border font-mono-tabular text-xs font-semibold transition-colors cursor-pointer ${
                      rating === num
                        ? 'border-amber-500 bg-amber-500 text-slate-950'
                        : 'border-white/10 bg-[#0d1015] text-slate-300 hover:bg-[#1a202b]'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="block font-medium text-slate-300">
                Contact Email (optional)
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@lab.org"
                className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="block font-medium text-slate-300">Feedback Details</span>
            <textarea
              rows={3}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share suggestions on physics, inverse kinematics, UI workflow, or Supabase sync..."
              className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
            />
          </label>

          {error && (
            <div
              role="alert"
              className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {error}
            </div>
          )}

          {submittedNotice && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              Thank you — feedback recorded cleanly.
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-white/10 bg-[#1a202b] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-[#232b3a] cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Sending...' : 'Submit Feedback'}
            </button>
          </div>
        </form>

        {/* Recent Submitted Feedback */}
        {history.length > 0 && (
          <div className="mt-4 flex-1 overflow-y-auto border-t border-white/10 pt-3 ide-scroll">
            <div className="mb-2 text-[11px] font-medium text-slate-400">
              Recent Submissions ({history.length})
            </div>
            <div className="space-y-2">
              {history.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="rounded border border-white/10 bg-[#0d1015] px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-medium text-slate-200">{item.category}</span>
                    <span className="font-mono-tabular">Rating {item.rating}/5</span>
                  </div>
                  <p className="mt-1 text-slate-300 leading-relaxed">{item.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

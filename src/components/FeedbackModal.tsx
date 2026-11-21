import React, { useEffect, useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  listFeedback,
  submitFeedback,
  type FeedbackCategory,
  type FeedbackSubmission,
} from '../data/platformStore';

const CATEGORIES: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'Feature Request', label: 'Idea' },
  { value: 'Physics & Kinematics', label: 'Physics' },
  { value: 'UI / Workflow', label: 'Interface' },
  { value: 'Bug Report', label: 'Bug' },
];

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'];

const PLACEHOLDERS: Record<FeedbackCategory, string> = {
  'Feature Request': 'What would you like AxisLab to do next?',
  'Physics & Kinematics': 'Which motion, contact, or IK result looked wrong, and on which robot?',
  'UI / Workflow': 'What felt slow, confusing, or hard to find?',
  'Bug Report': 'What did you do, what did you expect, and what happened instead?',
};

interface FeedbackModalProps {
  open: boolean;
  userId: string | null;
  /** Signed-in account email; only sent if the user opts in to a reply. */
  userEmail: string;
  appView: 'landing' | 'simulator';
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, userId, userEmail, appView, onClose }) => {
  const [category, setCategory] = useState<FeedbackCategory>('Feature Request');
  const [rating, setRating] = useState(4);
  const [message, setMessage] = useState('');
  const [wantsReply, setWantsReply] = useState(false);
  const [replyEmail, setReplyEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<FeedbackSubmission[]>([]);

  useEffect(() => {
    if (!open) return;
    // Only this user's own past feedback (never other people's on a shared device)
    setHistory(userId ? listFeedback().filter((f) => f.userId === userId) : []);
    setError(null);
    setSent(false);
    setWantsReply(false);
    setReplyEmail('');
  }, [open, userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await submitFeedback({
        userId,
        // Email is attached only when the user explicitly asks for a reply
        email: wantsReply ? userEmail || replyEmail : '',
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
      setSent(true);
      if (userId) setHistory(listFeedback().filter((f) => f.userId === userId));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} width={520}>
      <DialogHeader title="Send feedback" subtitle="Tell us what works and what doesn't. We read every note." />
      <form onSubmit={handleSubmit} noValidate>
        <VStack gap={4} padding={4}>
          <VStack gap={1.5}>
            <Text type="label">Topic</Text>
            <SegmentedControl
              label="Topic"
              value={category}
              onChange={(v) => setCategory(v as FeedbackCategory)}
              layout="fill"
            >
              {CATEGORIES.map((c) => (
                <SegmentedControlItem key={c.value} value={c.value} label={c.label} />
              ))}
            </SegmentedControl>
          </VStack>

          <VStack gap={1.5}>
            <HStack gap={2} justify="between">
              <Text type="label">How is AxisLab so far?</Text>
              <Text type="supporting" color="secondary">
                {rating}/5 · {RATING_LABELS[rating - 1]}
              </Text>
            </HStack>
            <SegmentedControl
              label="Rating from 1 (poor) to 5 (excellent)"
              value={String(rating)}
              onChange={(v) => setRating(Number(v))}
              layout="fill"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <SegmentedControlItem key={n} value={String(n)} label={String(n)} />
              ))}
            </SegmentedControl>
          </VStack>

          <TextArea
            label="Details"
            value={message}
            onChange={setMessage}
            placeholder={PLACEHOLDERS[category]}
            rows={4}
            isRequired
            width="100%"
          />

          <VStack gap={2}>
            <CheckboxInput
              label="I'd like a reply"
              description={
                userEmail
                  ? 'Attaches your account email to this message only.'
                  : 'Leave unchecked to send anonymously.'
              }
              value={wantsReply}
              onChange={setWantsReply}
            />
            {wantsReply && !userEmail && (
              <TextInput
                label="Reply email"
                type="email"
                value={replyEmail}
                onChange={setReplyEmail}
                placeholder="you@lab.org"
                width="100%"
              />
            )}
          </VStack>

          {error && <Banner status="error" title="Couldn't send" description={error} />}
          {sent && <Banner status="success" title="Thanks, feedback received" description="You can send another note any time." />}

          <HStack gap={2} justify="end">
            <Button label="Close" variant="ghost" onClick={onClose} />
            <Button
              type="submit"
              label="Send feedback"
              variant="primary"
              isLoading={submitting}
              isDisabled={message.trim().length < 3 || (wantsReply && !userEmail && replyEmail.trim() === '')}
            />
          </HStack>

          {history.length > 0 && (
            <VStack gap={2}>
              <Text type="label" color="secondary">
                Your recent feedback ({history.length})
              </Text>
              {history.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="rounded-[var(--radius-element)] border border-[var(--color-border)] bg-[var(--color-background-muted)] px-3 py-2"
                >
                  <HStack gap={2} justify="between">
                    <Text type="supporting">{CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category}</Text>
                    <Text type="supporting" color="secondary">
                      {item.rating}/5 · {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </HStack>
                  <Text color="secondary">{item.message}</Text>
                </div>
              ))}
            </VStack>
          )}
        </VStack>
      </form>
    </Dialog>
  );
};

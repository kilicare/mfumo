import { apiClient, unwrap } from '@/lib/api';

export type FeedbackCategory = 'BUG' | 'QUESTION' | 'IDEA';
export type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface FeedbackSubmission {
  id: string;
  category: FeedbackCategory;
  subject: string;
  message: string;
  pagePath: string | null;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackInboxItem extends FeedbackSubmission {
  submitterName: string;
  submitterEmail: string;
}

export interface FeedbackMessage {
  id: string;
  senderType: 'USER' | 'ADMIN';
  senderName: string;
  body: string;
  createdAt: string;
}

export const supportAPI = {
  async submit(input: {
    category: FeedbackCategory;
    subject: string;
    message: string;
    pagePath?: string;
  }) {
    return unwrap<FeedbackSubmission>(await apiClient.post('/support/feedback', input));
  },
  async mine() {
    return unwrap<FeedbackSubmission[]>(await apiClient.get('/support/feedback/mine'));
  },
  async inbox() {
    return unwrap<FeedbackInboxItem[]>(await apiClient.get('/support/feedback'));
  },
  async updateStatus(id: string, status: FeedbackStatus) {
    return unwrap<FeedbackInboxItem>(
      await apiClient.patch(`/support/feedback/${encodeURIComponent(id)}/status`, { status }),
    );
  },
  async messages(id: string) {
    return unwrap<FeedbackMessage[]>(
      await apiClient.get(`/support/feedback/${encodeURIComponent(id)}/messages`),
    );
  },
  async reply(id: string, body: string) {
    return unwrap<FeedbackMessage>(
      await apiClient.post(`/support/feedback/${encodeURIComponent(id)}/messages`, { body }),
    );
  },
};

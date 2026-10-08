'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Inbox,
  Lightbulb,
  LifeBuoy,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { getApiError } from '@/lib/api';
import {
  supportAPI,
  type FeedbackCategory,
  type FeedbackInboxItem,
  type FeedbackMessage,
  type FeedbackStatus,
  type FeedbackSubmission,
} from '@/lib/api/support';
import { notify } from '@/components/ui/AppToaster';
import { useAuthStore } from '@/store/authStore';

const statusStyles: Record<FeedbackStatus, string> = {
  OPEN: 'border-[#f0dfa9] bg-[#fff8e7] text-[#8d6412] dark:border-[#59451f] dark:bg-[#302817] dark:text-[#f1c66e]',
  IN_PROGRESS: 'border-[#cfe0f7] bg-[#edf5ff] text-[#315f9a] dark:border-[#284361] dark:bg-[#1d2b3c] dark:text-[#a9cbff]',
  RESOLVED: 'border-[#c8ead6] bg-[#eaf8ef] text-[#16734a] dark:border-[#24583a] dark:bg-[#173426] dark:text-[#8fe0b1]',
};

const categoryLabels: Record<FeedbackCategory, string> = {
  BUG: 'Problem',
  QUESTION: 'Question',
  IDEA: 'Idea',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function relativeDate(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

export default function HelpFeedbackPage() {
  const user = useAuthStore((state) => state.user);
  const canManageInbox = user?.permissions.includes('settings.edit') ?? false;
  const [category, setCategory] = useState<FeedbackCategory>('BUG');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [pageContext, setPageContext] = useState('');
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [mySubmissions, setMySubmissions] = useState<FeedbackSubmission[]>([]);
  const [inbox, setInbox] = useState<FeedbackInboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const messagesViewport = useRef<HTMLDivElement>(null);
  const stickToLatestMessage = useRef(true);

  const conversations = useMemo(
    () => canManageInbox ? inbox : mySubmissions,
    [canManageInbox, inbox, mySubmissions],
  );
  const selected = conversations.find((item) => item.id === selectedId) ?? null;

  const loadFeedback = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try {
      const [mine, all] = await Promise.all([
        supportAPI.mine(),
        canManageInbox ? supportAPI.inbox() : Promise.resolve(null),
      ]);
      setMySubmissions(mine);
      if (all) setInbox(all);
      setRefreshError('');
      const available = all ?? mine;
      const desktopLayout = window.matchMedia('(min-width: 1024px)').matches;
      if (available.length && !selectedId && desktopLayout) {
        setSelectedId(available[0].id);
      } else if (selectedId && !available.some((item) => item.id === selectedId)) {
        setSelectedId(desktopLayout ? available[0]?.id ?? null : null);
      }
      if (!available.length) setSelectedId(null);
    } catch (cause) {
      const message = getApiError(cause, 'Could not load conversations. Please try again.');
      if (quiet) setRefreshError(message);
      else setError(message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [canManageInbox, selectedId]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingThread(true);
    setThreadError('');
    try {
      const result = await supportAPI.messages(id);
      setMessages((current) => sameMessages(current, result) ? current : result);
    } catch (cause) {
      setThreadError(getApiError(cause, 'Could not load this conversation.'));
    } finally {
      if (!quiet) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadFeedback(true), 20_000);
    return () => window.clearInterval(timer);
  }, [loadFeedback]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let active = true;
    const refresh = async (quiet: boolean) => {
      if (!quiet) setLoadingThread(true);
      setThreadError('');
      try {
        const result = await supportAPI.messages(selectedId);
          if (active) {
            setMessages((current) => sameMessages(current, result) ? current : result);
            setThreadError('');
          }
      } catch (cause) {
        if (active) setThreadError(getApiError(cause, 'Could not load this conversation.'));
      } finally {
        if (active && !quiet) setLoadingThread(false);
      }
    };
    void refresh(false);
    const timer = window.setInterval(() => void refresh(true), 12_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  useEffect(() => {
    const viewport = messagesViewport.current;
    if (viewport && stickToLatestMessage.current) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, selectedId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const created = await supportAPI.submit({
        category,
        subject: subject.trim(),
        message: message.trim(),
        pagePath: pageContext.trim() || undefined,
      });
      setSubject('');
      setMessage('');
      setPageContext('');
      setNewConversationOpen(false);
      stickToLatestMessage.current = true;
      setSelectedId(created.id);
      void loadFeedback(true);
    } catch (cause) {
      notify.error(getApiError(cause, 'Could not start a conversation. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setReplying(true);
    try {
      const created = await supportAPI.reply(selectedId, reply.trim());
      stickToLatestMessage.current = true;
      setMessages((current) => [...current, created]);
      setReply('');
      void loadFeedback(true);
    } catch (cause) {
      notify.error(getApiError(cause, 'Could not send your reply. Please try again.'));
    } finally {
      setReplying(false);
    }
  }

  async function changeStatus(id: string, value: string) {
    if (!canManageInbox || !isFeedbackStatus(value)) return;
    setUpdatingId(id);
    try {
      const updated = await supportAPI.updateStatus(id, value);
      setInbox((current) => current.map((item) => item.id === id ? updated : item));
      setMySubmissions((current) => current.map((item) => item.id === id ? { ...item, status: updated.status } : item));
      notify.success('Conversation status updated.');
    } catch (cause) {
      notify.error(getApiError(cause, 'Could not update conversation status.'));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7 dark:border-[#343a32] dark:bg-[#191d19]">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f2aa] text-[#465600] dark:bg-[#303a18] dark:text-[#d8f04b]"><LifeBuoy size={22} /></span>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#738900] dark:text-[#d8f04b]">Genuine support</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#20211f] dark:text-[#f0f1ed]">Help & feedback</h1><p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#73766f] dark:text-[#afb5ac]">Start a conversation and get a reply from your business administrator.</p></div>
        </div>
        <button type="button" onClick={() => setNewConversationOpen(true)} className="feedback-primary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#20211f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#343632] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#738900] dark:bg-[#d8f04b] dark:text-white dark:hover:bg-[#e4f77a]"><Plus size={17} />New conversation</button>
      </header>

      {newConversationOpen ? (
        <section className="rounded-3xl border border-[#dfe7bd] bg-white p-5 shadow-sm sm:p-7 dark:border-[#41473f] dark:bg-[#191d19]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#738900] dark:text-[#d8f04b]">New support request</p><h2 className="mt-1 text-xl font-semibold text-[#20211f] dark:text-[#f0f1ed]">What can we help with?</h2></div>
            <button type="button" onClick={() => setNewConversationOpen(false)} aria-label="Close new conversation form" className="rounded-xl p-2 text-[#73766f] hover:bg-[#f3f4ef] dark:text-[#e7e9e3] dark:hover:bg-[#262b25]"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-[#32352e] dark:text-[#dce1d7]">Topic
              <select value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)} className="mt-1.5 min-h-11 w-full rounded-xl border border-[#dfe2da] bg-white px-3 text-sm dark:border-[#3b423a] dark:bg-[#111510] dark:text-[#e7e9e3]">
                <option value="BUG">Report a problem</option><option value="QUESTION">Ask a question</option><option value="IDEA">Share an idea</option>
              </select>
            </label>
            <label className="text-sm font-medium text-[#32352e] dark:text-[#dce1d7]">Subject
              <input required maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A short summary" className="mt-1.5 min-h-11 w-full rounded-xl border border-[#dfe2da] bg-white px-3 text-sm outline-none focus:border-[#829600] dark:border-[#3b423a] dark:bg-[#111510] dark:text-[#e7e9e3] dark:focus:border-[#d8f04b]" />
            </label>
            <label className="text-sm font-medium text-[#32352e] dark:text-[#dce1d7] lg:col-span-2">Message
              <textarea required maxLength={5000} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe the issue or ask your question…" className="mt-1.5 w-full resize-y rounded-xl border border-[#dfe2da] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#829600] dark:border-[#3b423a] dark:bg-[#111510] dark:text-[#e7e9e3] dark:focus:border-[#d8f04b]" />
              <span className="mt-1 block text-right text-xs text-[#858880] dark:text-[#c2c8bd]">{message.length}/5000</span>
            </label>
            <label className="text-sm font-medium text-[#32352e] dark:text-[#dce1d7] lg:col-span-2">Affected page or feature <span className="font-normal text-[#858880]">(optional)</span>
              <input maxLength={200} value={pageContext} onChange={(event) => setPageContext(event.target.value)} placeholder="e.g. Purchases → New purchase order" className="mt-1.5 min-h-11 w-full rounded-xl border border-[#dfe2da] bg-white px-3 text-sm outline-none focus:border-[#829600] dark:border-[#3b423a] dark:bg-[#111510] dark:text-[#e7e9e3] dark:focus:border-[#d8f04b]" />
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
              <p className="flex items-start gap-2 text-xs leading-5 text-[#73766f] dark:text-[#afb5ac]"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#738900]" />Never include passwords, access tokens, or payment card details.</p>
              <button type="submit" disabled={submitting} className="feedback-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20211f] px-4 text-sm font-semibold text-white transition hover:bg-[#343632] disabled:cursor-wait disabled:opacity-60 dark:bg-[#d8f04b] dark:text-white">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{submitting ? 'Starting…' : 'Start conversation'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="grid h-[min(72dvh,760px)] min-h-[420px] max-h-[760px] overflow-hidden rounded-3xl border border-[#e5e8df] bg-white shadow-sm lg:h-[min(70dvh,820px)] lg:min-h-[620px] lg:grid-cols-[330px_minmax(0,1fr)] dark:border-[#343a32] dark:bg-[#191d19]">
        <aside className={`flex min-h-0 flex-col border-b border-[#eceee8] lg:border-b-0 lg:border-r dark:border-[#343a32] ${selectedId ? 'hidden lg:flex' : ''}`}>
          <div className="flex shrink-0 items-center justify-between border-b border-[#eceee8] px-5 py-4 dark:border-[#343a32]">
            <div><h2 className="font-semibold text-[#20211f] dark:text-[#f0f1ed]">{canManageInbox ? 'Business inbox' : 'Your conversations'}</h2><p className="mt-0.5 text-xs text-[#858880] dark:text-[#c2c8bd]">{conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}</p></div>
            <button type="button" onClick={() => void loadFeedback()} aria-label="Refresh conversations" disabled={loading} className="rounded-xl p-2 text-[#73766f] transition hover:bg-[#f3f4ef] disabled:opacity-50 dark:text-[#e7e9e3] dark:hover:bg-[#262b25]"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          </div>
          {refreshError ? <p role="status" className="border-b border-[#f0dfa9] bg-[#fffaf0] px-5 py-2 text-xs text-[#8d6412] dark:border-[#59451f] dark:bg-[#302817] dark:text-[#f1c66e]">Refresh paused: {refreshError}</p> : null}
          {loading ? <div className="flex h-44 items-center justify-center text-sm text-[#73766f]"><Loader2 size={17} className="mr-2 animate-spin" />Loading conversations…</div> : error ? (
            <div role="alert" className="m-4 rounded-xl border border-[#efd4cf] bg-[#fff8f6] p-4 text-sm text-[#a63832] dark:border-[#663631] dark:bg-[#2b1b19] dark:text-[#ffaaa0]"><div className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div><button type="button" onClick={() => void loadFeedback()} className="mt-3 font-semibold underline">Try again</button></div>
          ) : conversations.length ? (
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {conversations.map((item) => <li key={item.id}>
                <button type="button" onClick={() => { stickToLatestMessage.current = true; setSelectedId(item.id); }} className={`w-full rounded-2xl p-3.5 text-left transition ${selectedId === item.id ? 'bg-[#f1f5dc] ring-1 ring-[#dce7a7] dark:bg-[#252b1a] dark:ring-[#414a24]' : 'hover:bg-[#f7f8f4] dark:hover:bg-[#222622]'}`}>
                  <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><CategoryIcon category={item.category} /><span className="truncate text-sm font-semibold text-[#30342e] dark:text-[#e7e9e3]">{item.subject}</span></div><ChevronRight size={15} className={`mt-0.5 shrink-0 text-[#9a9e95] transition ${selectedId === item.id ? 'translate-x-0.5 text-[#738900]' : ''}`} /></div>
                  <div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-xs text-[#73766f] dark:text-[#afb5ac]">{canManageInbox && isInboxItem(item) ? item.submitterName : categoryLabels[item.category]}</span><span className="shrink-0 text-[11px] text-[#858880] dark:text-[#c2c8bd]">{relativeDate(item.updatedAt)}</span></div>
                  <div className="mt-2"><StatusBadge status={item.status} /></div>
                </button>
              </li>)}
            </ul>
          ) : <div className="px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f3f4ef] text-[#83887d] dark:bg-[#222622] dark:text-[#afb5ac]"><Inbox size={21} /></span><p className="mt-3 text-sm font-semibold text-[#30342e] dark:text-[#e7e9e3]">No conversations yet</p><p className="mt-1 text-xs leading-5 text-[#858880]">Start a conversation and your replies will appear here.</p><button type="button" onClick={() => setNewConversationOpen(true)} className="mt-4 text-xs font-bold text-[#687d00] hover:underline dark:text-[#d8f04b]">Start a conversation</button></div>}
        </aside>

        <div className={`flex min-h-0 min-w-0 flex-col ${!selectedId ? 'hidden lg:flex' : ''}`}>
          {selected ? <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceee8] px-4 py-4 sm:px-6 dark:border-[#343a32]">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Back to conversations" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#73766f] transition hover:bg-[#f3f4ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#829600] lg:hidden dark:text-[#e7e9e3] dark:hover:bg-[#262b25] dark:focus-visible:outline-[#d8f04b]"><ArrowLeft size={18} /></button>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-semibold text-[#20211f] dark:text-[#f0f1ed]">{selected.subject}</h2><StatusBadge status={selected.status} /></div><p className="mt-1 text-xs text-[#858880] dark:text-[#c2c8bd]">{categoryLabels[selected.category]} · Started {formatDate(selected.createdAt)}</p></div>
              </div>
              <div className="flex items-center gap-2">
                {canManageInbox && isInboxItem(selected) ? <span className="hidden max-w-48 truncate text-xs text-[#73766f] sm:block dark:text-[#c2c8bd]">{selected.submitterName} · {selected.submitterEmail}</span> : null}
                {canManageInbox ? <label className="sr-only" htmlFor="conversation-status">Conversation status</label> : null}
                {canManageInbox ? <select id="conversation-status" value={selected.status} disabled={updatingId === selected.id} onChange={(event) => void changeStatus(selected.id, event.target.value)} className="min-h-9 rounded-xl border border-[#dfe2da] bg-white px-2.5 text-xs font-semibold text-[#545850] disabled:opacity-60 dark:border-[#3b423a] dark:bg-[#111510] dark:text-[#e7e9e3]">
                  <option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option>
                </select> : null}
              </div>
            </header>

            <div ref={messagesViewport} onScroll={(event) => {
              const node = event.currentTarget;
              stickToLatestMessage.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
            }} className="min-h-0 flex-1 overflow-y-auto bg-[#fafbf8] px-4 py-5 sm:px-7 dark:bg-[#141714]">
              {selected.pagePath ? <div className="mx-auto mb-5 flex max-w-3xl items-start gap-2 rounded-xl border border-[#e8e9e5] bg-white px-3.5 py-3 text-xs text-[#73766f] dark:border-[#343a32] dark:bg-[#191d19] dark:text-[#afb5ac]"><CircleHelp size={15} className="mt-0.5 shrink-0 text-[#829600]" /><span><span className="font-semibold">Related page:</span> {selected.pagePath}</span></div> : null}
              {threadError ? <div role="alert" className="mx-auto mb-4 flex max-w-3xl items-start gap-2 rounded-xl border border-[#efd4cf] bg-[#fff8f6] p-3 text-sm text-[#a63832] dark:border-[#663631] dark:bg-[#2b1b19] dark:text-[#ffaaa0]"><AlertCircle size={16} className="mt-0.5 shrink-0" />{threadError}<button type="button" onClick={() => void loadThread(selected.id)} className="ml-auto shrink-0 font-semibold underline">Retry</button></div> : null}
              {loadingThread ? <div className="flex h-40 items-center justify-center text-sm text-[#73766f]"><Loader2 size={17} className="mr-2 animate-spin" />Loading messages…</div> : (
                <div className="mx-auto max-w-3xl space-y-5">
                  {messages.map((item) => {
                    const ownMessage = item.senderType === (canManageInbox ? 'ADMIN' : 'USER');
                    return <article key={item.id} className={`flex items-end gap-2.5 ${ownMessage ? 'justify-end' : 'justify-start'}`}>
                      {!ownMessage ? <Avatar admin={item.senderType === 'ADMIN'} name={item.senderName} /> : null}
                      <div className={`max-w-[min(88%,620px)] ${ownMessage ? 'items-end' : 'items-start'}`}>
                        <div className={`mb-1 flex items-center gap-2 text-[11px] text-[#858880] dark:text-[#c2c8bd] ${ownMessage ? 'justify-end' : ''}`}>
                          <span className="font-semibold text-[#596057] dark:text-[#c2c8bd]">{ownMessage ? 'You' : item.senderType === 'ADMIN' ? 'Business admin' : item.senderName}</span><span>·</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                        </div>
                        <div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${ownMessage ? 'rounded-br-md bg-[#263326] text-white dark:bg-[#263326] dark:text-white' : 'rounded-bl-md border border-[#e7e9e3] bg-white text-[#43483f] dark:border-[#343a32] dark:bg-[#202520] dark:text-[#e7e9e3]'}`}>{item.body}</div>
                      </div>
                      {ownMessage ? <Avatar admin={canManageInbox} name={user?.name || user?.firstName || 'You'} /> : null}
                    </article>;
                  })}
                </div>
              )}
            </div>

            <form onSubmit={handleReply} className="border-t border-[#eceee8] bg-white p-4 sm:px-6 sm:py-5 dark:border-[#343a32] dark:bg-[#191d19]">
              <label htmlFor="reply-message" className="sr-only">Write a reply</label>
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[#dfe2da] bg-[#fafbf8] p-2 focus-within:border-[#9eb22d] focus-within:ring-2 focus-within:ring-[#d8f04b]/25 dark:border-[#3b423a] dark:bg-[#111510] dark:focus-within:border-[#829600]">
                <textarea id="reply-message" rows={2} maxLength={5000} required value={reply} onChange={(event) => setReply(event.target.value)} placeholder={selected.status === 'RESOLVED' ? 'Reply to reopen this conversation…' : 'Write a message…'} className="max-h-36 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-5 text-[#30342e] outline-none placeholder:text-[#9a9e95] dark:text-[#e7e9e3]" />
                <button type="submit" disabled={replying || !reply.trim()} aria-label="Send reply" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition disabled:cursor-not-allowed ${replying || !reply.trim() ? 'bg-[#263326] text-white opacity-40 dark:bg-[#303630] dark:text-[#afb5ac]' : 'bg-[#d8f04b] text-[#20211f] hover:bg-[#e4f77a] dark:bg-[#d8f04b] dark:text-[#20211f] dark:hover:bg-[#e4f77a]'}`}><Send size={17} /></button>
              </div>
              <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between gap-2 px-1"><p className="flex items-center gap-1.5 text-[11px] text-[#8a8f84] dark:text-[#c2c8bd]"><Clock3 size={12} />Messages refresh automatically</p><span className="text-[11px] text-[#9a9e95] dark:text-[#c2c8bd]">{reply.length}/5000</span></div>
            </form>
          </> : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[#f1f5dc] text-[#687d00] dark:bg-[#252b1a] dark:text-[#d8f04b]"><MessageCircle size={27} /></span>
              <h2 className="mt-5 text-lg font-semibold text-[#30342e] dark:text-[#e7e9e3]">{loading ? 'Loading your inbox…' : 'Your support conversations'}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#73766f] dark:text-[#afb5ac]">{loading ? 'Please wait while we fetch your messages.' : 'Choose a conversation on the left, or start a new one. Admin replies will appear right here.'}</p>
              {!loading && !conversations.length ? <button type="button" onClick={() => setNewConversationOpen(true)} className="feedback-primary mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#20211f] px-4 text-sm font-semibold text-white dark:bg-[#d8f04b] dark:text-white"><Plus size={16} />Start a conversation</button> : null}
            </div>
          )}
        </div>
      </section>

      <p className="flex items-start gap-2 px-1 text-xs leading-5 text-[#858880] dark:text-[#c2c8bd]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#829600] dark:text-[#d8f04b]" />Conversations are visible only to you and authorized administrators in your business. Never send passwords or access tokens.</p>
    </div>
  );
}

function isFeedbackStatus(value: string): value is FeedbackStatus {
  return value === 'OPEN' || value === 'IN_PROGRESS' || value === 'RESOLVED';
}

function isInboxItem(item: FeedbackSubmission | FeedbackInboxItem): item is FeedbackInboxItem {
  return 'submitterName' in item && typeof item.submitterName === 'string';
}

function sameMessages(current: FeedbackMessage[], incoming: FeedbackMessage[]) {
  return current.length === incoming.length
    && current.every((message, index) => message.id === incoming[index].id);
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const label = status === 'IN_PROGRESS' ? 'In progress' : status === 'OPEN' ? 'Open' : 'Resolved';
  const Icon = status === 'RESOLVED' ? Check : status === 'OPEN' ? Clock3 : MessageCircle;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyles[status]}`}><Icon size={11} />{label}</span>;
}

function CategoryIcon({ category }: { category: FeedbackCategory }) {
  const Icon = category === 'BUG' ? Wrench : category === 'QUESTION' ? CircleHelp : Lightbulb;
  return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#f1f5dc] text-[#687d00] dark:bg-[#303a18] dark:text-[#d8f04b]"><Icon size={15} /></span>;
}

function Avatar({ admin, name }: { admin: boolean; name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
  return <span aria-hidden="true" className={`mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[10px] font-bold ${admin ? 'bg-[#e8f2aa] text-[#465600] dark:bg-[#303a18] dark:text-[#d8f04b]' : 'bg-[#e9ece5] text-[#5b6255] dark:bg-[#303630] dark:text-[#dce1d7]'}`}>{initials}</span>;
}

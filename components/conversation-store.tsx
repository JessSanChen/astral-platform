"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { Chat } from "@ai-sdk/react";
import type { LabelValues } from "@/components/labels-panel";

export type StoredConversation = {
  id: string;
  title: string;
  status: "draft" | "submitted";
  currentVersion: number;
  createdAt: string;
};

export type JudgeRun = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  conversationStartedAt?: string;
  judgeName: string;
  turnCount?: number | null;
  verdict: string | null;
  parsed: { verdict?: JudgeVerdictShape } | null;
  status: string;
  createdAt: string;
};

export type JudgeVerdictShape = {
  headline: string;
  detail?: string;
  severity?: number;
  categories?: string[];
  flagged: boolean;
};

export type RightTab = "labels" | "scanners";

type Store = {
  conversations: StoredConversation[];
  addConversation: (c: StoredConversation) => void;
  patchConversation: (id: string, patch: Partial<StoredConversation>) => void;
  /**
   * The chat for a conversation, created once and kept.
   *
   * Holding these here rather than inside the conversation component is what
   * lets a reply keep streaming while the participant is looking at another
   * conversation. A component-owned chat is thrown away on navigation, which
   * cancels the request mid-flight; this one simply carries on, and the text
   * is already there on return.
   */
  getChat: (id: string, initialMessages: UIMessage[]) => Chat<UIMessage>;
  /** True the first time a conversation is opened in this session. */
  isFirstOpen: (id: string) => boolean;
  isGenerating: (id: string) => boolean;
  setGenerating: (id: string, value: boolean) => void;
  /**
   * The labels form as the participant last left it, per conversation.
   *
   * The page a conversation is rendered from is cached in the browser so that
   * switching is instant, which means the labels it carries are the ones from
   * when it was first loaded. Anything that rebuilt the form from them (a
   * submit, switching to the scanners tab and back, leaving the conversation
   * and returning) showed those old values, usually blank, over answers that
   * had been given and saved since.
   */
  getLabelDraft: (id: string) => LabelValues | undefined;
  setLabelDraft: (id: string, values: LabelValues) => void;
  /**
   * The turns a participant has marked as evidence for their labels, per
   * conversation, as the numbers shown beside the messages.
   *
   * Held here, not in the labels form, because two parts of the screen
   * share it: the conversation, where the turns are clicked, and the labels
   * panel, which lists them and sends them. Undefined until something has
   * been marked or unmarked in this session, so the caller can fall back to
   * what the server had.
   */
  evidence: Record<string, number[]>;
  setEvidence: (id: string, turns: number[]) => void;
  /** The conversation whose turns are being picked right now, if any. */
  selectingEvidenceFor: string | null;
  setSelectingEvidenceFor: (id: string | null) => void;
  // The right-hand panel's state lives here so the chosen tab and the
  // scanner results survive moving between conversations.
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  judgeRuns: JudgeRun[];
  setJudgeRuns: (runs: JudgeRun[]) => void;
};

const Ctx = createContext<Store | null>(null);

/**
 * Client-side state for the conversation list, the messages already seen, and
 * which conversations are mid-reply.
 *
 * It lives in the chat layout, so it survives moving between conversations.
 * That buys three things the server alone could not:
 *
 *  - Switching to a conversation already visited shows instantly from memory
 *    rather than waiting on the database.
 *  - A new conversation appears in the list the moment it is created, instead
 *    of after the next time the page happens to be refetched.
 *  - A reply still being generated is remembered, so leaving a conversation
 *    and coming back shows that it is still working rather than a blank gap.
 */
export function ConversationStoreProvider({
  initialConversations,
  children,
}: {
  initialConversations: StoredConversation[];
  children: React.ReactNode;
}) {
  const [conversations, setConversations] =
    useState<StoredConversation[]>(initialConversations);
  // Refs, not state: changing these must not re-render the whole chat.
  const chats = useRef(new Map<string, Chat<UIMessage>>());
  const generating = useRef(new Set<string>());
  const labelDrafts = useRef(new Map<string, LabelValues>());
  const [generatingTick, setGeneratingTick] = useState(0);
  const [rightTab, setRightTab] = useState<RightTab>("labels");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [judgeRuns, setJudgeRuns] = useState<JudgeRun[]>([]);
  const [evidence, setEvidenceState] = useState<Record<string, number[]>>({});
  const [selectingEvidenceFor, setSelectingEvidenceFor] = useState<string | null>(null);

  const setEvidence = useCallback((id: string, turns: number[]) => {
    const sorted = [...new Set(turns)].sort((a, b) => a - b);
    setEvidenceState((all) => ({ ...all, [id]: sorted }));
  }, []);

  const addConversation = useCallback((c: StoredConversation) => {
    setConversations((list) =>
      list.some((x) => x.id === c.id) ? list : [c, ...list],
    );
  }, []);

  const patchConversation = useCallback(
    (id: string, patch: Partial<StoredConversation>) => {
      setConversations((list) => {
        const current = list.find((c) => c.id === id);
        if (!current) return list;
        // Skip updates that change nothing, so callers can patch freely
        // without causing a re-render loop.
        const unchanged = Object.entries(patch).every(
          ([k, v]) => current[k as keyof StoredConversation] === v,
        );
        if (unchanged) return list;
        return list.map((c) => (c.id === id ? { ...c, ...patch } : c));
      });
    },
    [],
  );

  const isFirstOpen = useCallback((id: string) => !chats.current.has(id), []);

  const getChat = useCallback((id: string, initialMessages: UIMessage[]) => {
    const existing = chats.current.get(id);
    if (existing) return existing;
    const chat = new Chat<UIMessage>({
      id,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: { conversationId: id },
      }),
    });
    chats.current.set(id, chat);
    return chat;
  }, []);

  const getLabelDraft = useCallback(
    (id: string) => labelDrafts.current.get(id),
    [],
  );
  const setLabelDraft = useCallback((id: string, values: LabelValues) => {
    labelDrafts.current.set(id, values);
  }, []);

  const isGenerating = useCallback(
    (id: string) => generating.current.has(id),
    // generatingTick forces consumers to re-read after a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generatingTick],
  );

  const setGenerating = useCallback((id: string, value: boolean) => {
    // Only announce real changes. Signalling unconditionally changes the
    // store's identity, which re-runs the effect that called this, which
    // signals again: a loop that locks the page.
    const had = generating.current.has(id);
    if (had === value) return;
    if (value) generating.current.add(id);
    else generating.current.delete(id);
    setGeneratingTick((t) => t + 1);
  }, []);

  const value = useMemo(
    () => ({
      conversations,
      addConversation,
      patchConversation,
      getChat,
      isFirstOpen,
      isGenerating,
      setGenerating,
      getLabelDraft,
      setLabelDraft,
      evidence,
      setEvidence,
      selectingEvidenceFor,
      setSelectingEvidenceFor,
      rightTab,
      setRightTab,
      rightPanelOpen,
      setRightPanelOpen,
      judgeRuns,
      setJudgeRuns,
    }),
    [
      evidence,
      setEvidence,
      selectingEvidenceFor,
      rightTab,
      rightPanelOpen,
      judgeRuns,
      conversations,
      addConversation,
      patchConversation,
      getChat,
      isFirstOpen,
      isGenerating,
      setGenerating,
      getLabelDraft,
      setLabelDraft,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConversationStore() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useConversationStore must be used inside the chat layout");
  return ctx;
}

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

/**
 * One session, with what is needed about the episode it belongs to. An
 * episode is a standalone conversation (one session) or a folder (several).
 */
/** One run of a safety scanner over a conversation, as the panel lists it. */
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

/** The side panel's two tabs: the work's details, and the scanners. */
export type RightTab = "details" | "scanners";

export type StoredConversation = {
  id: string;
  title: string;
  status: "draft" | "submitted";
  createdAt: string;
  episodeId: string;
  episodeTitle: string;
  isFolder: boolean;
  sessionOrder: number;
  episodeStatus: "draft" | "submitted";
  /** Made with Create related version. */
  related: boolean;
};

type Store = {
  conversations: StoredConversation[];
  addConversation: (c: StoredConversation) => void;
  patchConversation: (id: string, patch: Partial<StoredConversation>) => void;
  /** Changes every session of one episode: its title, or that it is submitted. */
  patchEpisode: (
    episodeId: string,
    patch: Partial<Pick<StoredConversation, "episodeTitle" | "isFolder" | "episodeStatus">>,
  ) => void;
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
  // Whether the panel beside the chat is open; kept across conversations.
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;
  // Scanner results are kept here, not in the tab, so that switching tabs
  // or conversations does not lose them or fetch them again.
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
  const [generatingTick, setGeneratingTick] = useState(0);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("details");
  const [judgeRuns, setJudgeRuns] = useState<JudgeRun[]>([]);

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

  const patchEpisode = useCallback<Store["patchEpisode"]>((episodeId, patch) => {
    setConversations((list) =>
      list.map((c) =>
        c.episodeId === episodeId
          ? {
              ...c,
              ...patch,
              // A submitted episode's sessions are submitted with it.
              ...(patch.episodeStatus === "submitted" ? { status: "submitted" as const } : {}),
            }
          : c,
      ),
    );
  }, []);

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
      patchEpisode,
      getChat,
      isFirstOpen,
      isGenerating,
      setGenerating,
      rightPanelOpen,
      setRightPanelOpen,
      rightTab,
      setRightTab,
      judgeRuns,
      setJudgeRuns,
    }),
    [
      rightPanelOpen,
      rightTab,
      judgeRuns,
      conversations,
      addConversation,
      patchConversation,
      patchEpisode,
      getChat,
      isFirstOpen,
      isGenerating,
      setGenerating,
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

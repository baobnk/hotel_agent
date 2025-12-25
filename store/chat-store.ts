import { create } from "zustand";

export type Message = {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
};

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  isArchived?: boolean;
  createdAt: Date;
};

interface ChatState {
  chats: Chat[];
  selectedChatId: string | null;
  addChat: (chat: Chat) => void;
  removeChat: (id: string) => void;
  selectChat: (id: string) => void;
  archiveChat: (id: string) => void;
  unarchiveChat: (id: string) => void;
  deleteChat: (id: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  selectedChatId: null,
  addChat: (chat) =>
    set((state) => ({
      chats: [...state.chats, chat],
      selectedChatId: chat.id,
    })),
  removeChat: (id) =>
    set((state) => ({
      chats: state.chats.filter((chat) => chat.id !== id),
      selectedChatId: state.selectedChatId === id ? null : state.selectedChatId,
    })),
  selectChat: (id) => set({ selectedChatId: id }),
  archiveChat: (id) =>
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id ? { ...chat, isArchived: true } : chat
      ),
    })),
  unarchiveChat: (id) =>
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id ? { ...chat, isArchived: false } : chat
      ),
    })),
  deleteChat: (id) =>
    set((state) => ({
      chats: state.chats.filter((chat) => chat.id !== id),
      selectedChatId: state.selectedChatId === id ? null : state.selectedChatId,
    })),
}));

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatUserContext = {
  username?: string | null;
  skin_type?: string | null;
  main_concerns?: string | null;
  healthscore?: number | null;
  sleep_quality?: string | null;
  water_intake?: string | null;
  stress_level?: string | null;
  routine_summary?: string | null;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  animate?: boolean;
};

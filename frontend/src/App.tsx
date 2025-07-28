// frontend/src/App.tsx (Fixed version)
import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import { useState, useEffect, useRef, useCallback } from "react";
import { ProcessedEvent } from "@/components/ActivityTimeline";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";

export default function App() {
  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<
    ProcessedEvent[]
  >([]);
  const [historicalActivities, setHistoricalActivities] = useState<
    Record<string, ProcessedEvent[]>
  >({});
  // Fixed: Use a more stable state structure for YouTube results
  const [youtubeResults, setYoutubeResults] = useState<any>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string>("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  const thread = useStream<{
    messages: Message[];
    initial_search_query_count: number;
    max_research_loops: number;
    reasoning_model: string;
    intent_type?: string;
    youtube_results?: any;
  }>({
    apiUrl: import.meta.env.DEV
      ? "http://localhost:2024"
      : "http://localhost:8123",
    assistantId: "agent",
    messagesKey: "messages",
    onFinish: (event: any) => {
      console.log("Thread finished:", event);
    },
    onUpdateEvent: (event: any) => {
      let processedEvent: ProcessedEvent | null = null;
      
      // Handle intent classification
      if (event.classify_intent) {
        const intent = event.classify_intent.intent_type;
        processedEvent = {
          title: "Analyzing Intent",
          data: `Detected: ${intent} (${Math.round(event.classify_intent.confidence * 100)}% confidence)`,
        };
      }
      
      // Handle YouTube action - Fixed: More stable YouTube result handling
      else if (event.youtube_action) {
        const results = event.youtube_action.youtube_results;
        if (results && results.videos && results.videos.length > 0) {
          // Fixed: Store YouTube results with a unique identifier to prevent disappearing
          const stableResults = {
            ...results,
            timestamp: Date.now(),
            threadId: currentThreadId
          };
          setYoutubeResults(stableResults);
          processedEvent = {
            title: "YouTube Search",
            data: `Found ${results.videos.length} videos for "${results.query}"`,
          };
        } else {
          processedEvent = {
            title: "YouTube Search",
            data: "No videos found or YouTube not configured",
          };
        }
      }
      
      // Existing event handlers
      else if (event.generate_query) {
        const queries = event.generate_query.query_list || [];
        const queryString = Array.isArray(queries) ? queries.join(", ") : String(queries);
        processedEvent = {
          title: "Generating Search Queries",
          data: queryString,
        };
      } else if (event.web_research) {
        const sources = event.web_research.sources_gathered || [];
        const numSources = sources.length;
        const uniqueLabels = [
          ...new Set(sources.map((s: any) => s.label).filter(Boolean)),
        ];
        const exampleLabels = uniqueLabels.slice(0, 3).join(", ");
        processedEvent = {
          title: "Web Research",
          data: `Gathered ${numSources} sources. Related to: ${
            exampleLabels || "N/A"
          }.`,
        };
      } else if (event.reflection) {
        processedEvent = {
          title: "Reflection",
          data: event.reflection.is_sufficient
            ? "Search successful, generating final answer."
            : `Need more information, searching for ${event.reflection.follow_up_queries?.join(
                ", "
              ) || "additional information"}`,
        };
      } else if (event.finalize_answer) {
        processedEvent = {
          title: "Finalizing Answer",
          data: "Composing and presenting the final answer.",
        };
        hasFinalizeEventOccurredRef.current = true;
      }
      
      if (processedEvent) {
        setProcessedEventsTimeline((prevEvents) => [
          ...prevEvents,
          processedEvent!,
        ]);
      }
    },
  });

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [thread.messages]);

  useEffect(() => {
    if (
      hasFinalizeEventOccurredRef.current &&
      !thread.isLoading &&
      thread.messages.length > 0
    ) {
      const lastMessage = thread.messages[thread.messages.length - 1];
      if (lastMessage && lastMessage.type === "ai" && lastMessage.id) {
        setHistoricalActivities((prev) => ({
          ...prev,
          [lastMessage.id!]: [...processedEventsTimeline],
        }));
      }
      hasFinalizeEventOccurredRef.current = false;
    }
  }, [thread.messages, thread.isLoading, processedEventsTimeline]);

  const handleSubmit = useCallback(
    (submittedInputValue: string, effort: string, model: string) => {
      if (!submittedInputValue.trim()) return;
      
      // Fixed: Generate a unique thread ID to track YouTube results
      const newThreadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentThreadId(newThreadId);
      
      setProcessedEventsTimeline([]);
      // Fixed: Don't reset YouTube results immediately, let them persist until new ones arrive
      if (!thread.isLoading) {
        setYoutubeResults(null);
      }
      hasFinalizeEventOccurredRef.current = false;

      // convert effort to, initial_search_query_count and max_research_loops
      let initial_search_query_count = 0;
      let max_research_loops = 0;
      switch (effort) {
        case "low":
          initial_search_query_count = 1;
          max_research_loops = 1;
          break;
        case "medium":
          initial_search_query_count = 3;
          max_research_loops = 3;
          break;
        case "high":
          initial_search_query_count = 5;
          max_research_loops = 10;
          break;
      }

      const newMessages: Message[] = [
        ...(thread.messages || []),
        {
          type: "human",
          content: submittedInputValue,
          id: Date.now().toString(),
        },
      ];
      thread.submit({
        messages: newMessages,
        initial_search_query_count: initial_search_query_count,
        max_research_loops: max_research_loops,
        reasoning_model: model,
      });
    },
    [thread, currentThreadId]
  );

  const handleCancel = useCallback(() => {
    thread.stop();
    // Fixed: Reset YouTube results when cancelling
    setYoutubeResults(null);
    setCurrentThreadId("");
    window.location.reload();
  }, [thread]);

  return (
    <div className="flex h-screen bg-neutral-800 text-neutral-100 font-sans antialiased">
      <main className="h-full w-full max-w-4xl mx-auto">
          {thread.messages.length === 0 ? (
            <WelcomeScreen
              handleSubmit={handleSubmit}
              isLoading={thread.isLoading}
              onCancel={handleCancel}
            />
          ) : (
            <ChatMessagesView
              messages={thread.messages}
              isLoading={thread.isLoading}
              scrollAreaRef={scrollAreaRef}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              liveActivityEvents={processedEventsTimeline}
              historicalActivities={historicalActivities}
              youtubeResults={youtubeResults} // Pass stable YouTube results
            />
          )}
      </main>
    </div>
  );
}
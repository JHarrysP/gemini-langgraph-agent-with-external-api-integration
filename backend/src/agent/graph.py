import os
from dotenv import load_dotenv
from langchain_core.messages import AIMessage
from langgraph.types import Send
from langgraph.graph import StateGraph
from langgraph.graph import START, END
from langchain_core.runnables import RunnableConfig
from google.genai import Client
from langchain_google_genai import ChatGoogleGenerativeAI
from typing import Annotated
from typing_extensions import TypedDict
from operator import add
from typing import Annotated, List
from typing_extensions import TypedDict
from operator import add
from langgraph.graph import StateGraph



class QueryGenerationState(TypedDict):
    query_list: Annotated[List, add]


# Move these imports inside functions to avoid circular imports
# from agent.tools_and_schemas import SearchQueryList, Reflection, IntentClassification
# from agent.youtube_tool import YouTubeTool, YouTubeSearchResults

from agent.state import (
    OverallState,
    QueryGenerationState,
    ReflectionState,
    WebSearchState,
    YouTubeActionState,
)
from agent.configuration import Configuration
from agent.prompts import (
    get_current_date,
    query_writer_instructions,
    web_searcher_instructions,
    reflection_instructions,
    answer_instructions,
    intent_classification_instructions,
)
from agent.utils import (
    get_citations,
    get_research_topic,
    insert_citation_markers,
    resolve_urls,
)

load_dotenv()

if os.getenv("GEMINI_API_KEY") is None:
    raise ValueError("GEMINI_API_KEY is not set")

# Initialize clients
genai_client = Client(api_key=os.getenv("GEMINI_API_KEY"))
# Move YouTube tool initialization inside the function that uses it
# youtube_tool = YouTubeTool() if os.getenv("YOUTUBE_API_KEY") else None


# NEW NODE: Intent Classification
def classify_intent(state: OverallState, config: RunnableConfig) -> OverallState:
    """Classify whether the user query is for research or YouTube action"""
    # Import locally to avoid circular imports
    from agent.tools_and_schemas import IntentClassification
    
    configurable = Configuration.from_runnable_config(config)
    
    llm = ChatGoogleGenerativeAI(
        model=configurable.query_generator_model,
        temperature=0,
        max_retries=2,
        api_key=os.getenv("GEMINI_API_KEY"),
    )
    
    structured_llm = llm.with_structured_output(IntentClassification)
    
    formatted_prompt = intent_classification_instructions.format(
        user_query=get_research_topic(state["messages"])
    )
    
    result = structured_llm.invoke(formatted_prompt)
    
    return {
        "intent_type": result.intent_type,
        "confidence": result.confidence,
        "youtube_query": result.youtube_query if result.intent_type in ["youtube", "mixed"] else None,
    }


# NEW NODE: YouTube Action
def youtube_action(state: YouTubeActionState, config: RunnableConfig) -> OverallState:
    """Execute YouTube search and return results"""
    # Import locally to avoid circular imports
    from agent.youtube_tool import YouTubeTool
    
    youtube_tool = YouTubeTool() if os.getenv("YOUTUBE_API_KEY") else None
    
    if not youtube_tool:
        return {
            "messages": [AIMessage(content="YouTube integration is not configured. Please add YOUTUBE_API_KEY to your environment variables.")],
            "youtube_results": None,
        }
    
    try:
        # Use the extracted YouTube query or fall back to original message
        query = state.get("youtube_query") or get_research_topic(state["messages"])
        
        # Search YouTube
        results = youtube_tool.search_videos(query, max_results=5)
        
        if not results.videos:
            response_text = f"Sorry, I couldn't find any YouTube videos for '{query}'. Try a different search term."
        else:
            # Format response text
            response_text = f"I found {len(results.videos)} videos for '{query}':\n\n"
            for i, video in enumerate(results.videos, 1):
                response_text += f"{i}. **{video.title}** by {video.channel}\n"
                response_text += f"   Duration: {video.duration} | Views: {video.view_count}\n"
                response_text += f"   Published: {video.published_at}\n\n"
        
        return {
            "messages": [AIMessage(content=response_text)],
            "youtube_results": results.dict() if results.videos else None,
        }
        
    except Exception as e:
        return {
            "messages": [AIMessage(content=f"Error searching YouTube: {str(e)}")],
            "youtube_results": None,
        }


# ROUTING FUNCTION
def route_after_intent(state: OverallState) -> str:
    """Route to either research or YouTube action based on intent classification"""
    intent_type = state.get("intent_type", "research")
    
    if intent_type == "youtube":
        return "youtube_action"
    else:
        return "generate_query"


# FIXED: Generate Query Node
def generate_query(state: OverallState, config: RunnableConfig) -> OverallState:
    """LangGraph node that generates search queries based on the User's question."""
    from agent.tools_and_schemas import SearchQueryList

    configurable = Configuration.from_runnable_config(config)

    if state.get("initial_search_query_count") is None:
        state["initial_search_query_count"] = configurable.number_of_initial_queries

    llm = ChatGoogleGenerativeAI(
        model=configurable.query_generator_model,
        temperature=1.0,
        max_retries=2,
        api_key=os.getenv("GEMINI_API_KEY"),
    )
    structured_llm = llm.with_structured_output(SearchQueryList)

    current_date = get_current_date()
    research_topic = get_research_topic(state["messages"])

    youtube_context = ""
    if state.get("youtube_results"):
        youtube_context = "\n\nNote: The user also requested YouTube videos, which have been provided separately."

    formatted_prompt = query_writer_instructions.format(
        current_date=current_date,
        research_topic=research_topic + youtube_context,
        number_queries=state["initial_search_query_count"],
    )

    result = structured_llm.invoke(formatted_prompt)

    # Fixed: Return the queries directly as a list for the Annotated field
    return {"query_list": result.query}


def continue_to_web_research(state: OverallState):
    """Fixed: Get queries from the properly annotated query_list"""
    queries = state.get("query_list", [])
    if not isinstance(queries, list):
        queries = [queries] if queries else []

    return [
        Send("web_research", {"search_query": query, "id": int(idx)})
        for idx, query in enumerate(queries)
    ]


def web_research(state: WebSearchState, config: RunnableConfig) -> OverallState:
    try:
        configurable = Configuration.from_runnable_config(config)

        # Fixed: Only use search_query from WebSearchState
        search_query = state.get("search_query")
        if not search_query:
            raise ValueError("Missing 'search_query' in state.")

        # Normalize to string
        if isinstance(search_query, list):
            search_query = ", ".join(search_query)
        else:
            search_query = str(search_query)

        formatted_prompt = web_searcher_instructions.format(
            current_date=get_current_date(),
            research_topic=search_query,
        )

        response = genai_client.models.generate_content(
            model=configurable.query_generator_model,
            contents=formatted_prompt,
            config={
                "tools": [{"google_search": {}}],
                "temperature": 0,
            },
        )

        grounding = getattr(response.candidates[0], "grounding_metadata", None)
        if not grounding:
            return {
                "sources_gathered": [],
                "search_query": [search_query],  # Use search_query instead of query_list
                "web_research_result": [response.text],
            }

        resolved_urls = resolve_urls(grounding.grounding_chunks, state.get("id", 0))
        citations = get_citations(response, resolved_urls)
        modified_text = insert_citation_markers(response.text, citations)
        sources_gathered = [item for citation in citations for item in citation["segments"]]

        return {
            "sources_gathered": sources_gathered,
            "search_query": [search_query],  # Use search_query instead of query_list
            "web_research_result": [modified_text],
        }

    except Exception as e:
        print(f"Error in web_research: {e}")
        return {
            "sources_gathered": [],
            "search_query": [state.get("search_query", "unknown")],
            "web_research_result": [f"Error performing web research: {str(e)}"],
        }


def reflection(state: OverallState, config: RunnableConfig) -> ReflectionState:
    """LangGraph node that identifies knowledge gaps and generates potential follow-up queries."""
    # Import locally to avoid circular imports
    from agent.tools_and_schemas import Reflection
    
    configurable = Configuration.from_runnable_config(config)
    # Increment the research loop count and get the reasoning model
    state["research_loop_count"] = state.get("research_loop_count", 0) + 1
    reasoning_model = state.get("reasoning_model") or configurable.reflection_model

    # Format the prompt
    current_date = get_current_date()
    formatted_prompt = reflection_instructions.format(
        current_date=current_date,
        research_topic=get_research_topic(state["messages"]),
        summaries="\n\n---\n\n".join(state["web_research_result"]),
    )
    # init Reasoning Model
    llm = ChatGoogleGenerativeAI(
        model=reasoning_model,
        temperature=1.0,
        max_retries=2,
        api_key=os.getenv("GEMINI_API_KEY"),
    )
    result = llm.with_structured_output(Reflection).invoke(formatted_prompt)

    return {
        "is_sufficient": result.is_sufficient,
        "knowledge_gap": result.knowledge_gap,
        "follow_up_queries": result.follow_up_queries,
        "research_loop_count": state["research_loop_count"],
        "number_of_ran_queries": len(state["search_query"]),
    }


def evaluate_research(
    state: ReflectionState,
    config: RunnableConfig,
) -> OverallState:
    """LangGraph routing function that determines the next step in the research flow."""
    configurable = Configuration.from_runnable_config(config)
    max_research_loops = (
        state.get("max_research_loops")
        if state.get("max_research_loops") is not None
        else configurable.max_research_loops
    )
    if state["is_sufficient"] or state["research_loop_count"] >= max_research_loops:
        return "finalize_answer"
    else:
        return [
            Send(
                "web_research",
                {
                    "search_query": follow_up_query,
                    "id": state["number_of_ran_queries"] + int(idx),
                },
            )
            for idx, follow_up_query in enumerate(state["follow_up_queries"])
        ]


def finalize_answer(state: OverallState, config: RunnableConfig):
    """LangGraph node that finalizes the research summary."""
    configurable = Configuration.from_runnable_config(config)
    reasoning_model = state.get("reasoning_model") or configurable.answer_model

    # Format the prompt
    current_date = get_current_date()
    formatted_prompt = answer_instructions.format(
        current_date=current_date,
        research_topic=get_research_topic(state["messages"]),
        summaries="\n---\n\n".join(state["web_research_result"]),
    )

    # init Reasoning Model, default to Gemini 2.5 Pro
    llm = ChatGoogleGenerativeAI(
        model=reasoning_model,
        temperature=0,
        max_retries=2,
        api_key=os.getenv("GEMINI_API_KEY"),
    )
    result = llm.invoke(formatted_prompt)

    # Replace the short urls with the original urls and add all used urls to the sources_gathered
    unique_sources = []
    for source in state["sources_gathered"]:
        if source["short_url"] in result.content:
            result.content = result.content.replace(
                source["short_url"], source["value"]
            )
            unique_sources.append(source)

    return {
        "messages": [AIMessage(content=result.content)],
        "sources_gathered": unique_sources,
    }

# Create our Agent Graph
builder = StateGraph(OverallState)

# Add all nodes
builder.add_node("classify_intent", classify_intent)
builder.add_node("generate_query", generate_query)
builder.add_node("youtube_action", youtube_action)
builder.add_node("web_research", web_research)
builder.add_node("reflection", reflection)
builder.add_node("finalize_answer", finalize_answer)

# Set the entrypoint as intent classification
builder.add_edge(START, "classify_intent")

# Route based on intent
builder.add_conditional_edges(
    "classify_intent", 
    route_after_intent, 
    ["generate_query", "youtube_action"]
)

# YouTube action goes directly to END (for pure YouTube queries)
builder.add_edge("youtube_action", END)

# Rest of the research flow remains the same
builder.add_conditional_edges(
    "generate_query", continue_to_web_research, ["web_research"]
)
builder.add_edge("web_research", "reflection")
builder.add_conditional_edges(
    "reflection", evaluate_research, ["web_research", "finalize_answer"]
)
builder.add_edge("finalize_answer", END)



graph = builder.compile(name="pro-search-agent-with-youtube")
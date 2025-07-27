from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class SearchQueryList(BaseModel):
    query: List[str] = Field(
        description="A list of search queries to be used for web research."
    )
    rationale: str = Field(
        description="A brief explanation of why these queries are relevant to the research topic."
    )


class Reflection(BaseModel):
    is_sufficient: bool = Field(
        description="Whether the provided summaries are sufficient to answer the user's question."
    )
    knowledge_gap: str = Field(
        description="A description of what information is missing or needs clarification."
    )
    follow_up_queries: List[str] = Field(
        description="A list of follow-up queries to address the knowledge gap."
    )


class IntentClassification(BaseModel):
    intent_type: Literal["research", "youtube", "mixed"] = Field(
        description="Type of user intent: 'research' for information gathering, 'youtube' for video search, 'mixed' for both"
    )
    confidence: float = Field(
        description="Confidence score between 0 and 1 for the intent classification"
    )
    youtube_query: Optional[str] = Field(
        description="Extracted YouTube search query if intent_type is 'youtube' or 'mixed'",
        default=None
    )
    research_topic: Optional[str] = Field(
        description="Extracted research topic if intent_type is 'research' or 'mixed'",
        default=None
    )
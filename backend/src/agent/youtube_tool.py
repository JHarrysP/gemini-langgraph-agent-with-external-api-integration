# backend/src/agent/youtube_tool.py
import os
import requests
from typing import List, Dict, Any
from pydantic import BaseModel, Field


class YouTubeVideoResult(BaseModel):
    video_id: str = Field(description="YouTube video ID")
    title: str = Field(description="Video title")
    channel: str = Field(description="Channel name")
    description: str = Field(description="Video description (truncated)")
    thumbnail_url: str = Field(description="Video thumbnail URL")
    duration: str = Field(description="Video duration")
    view_count: str = Field(description="Number of views")
    published_at: str = Field(description="Publication date")


class YouTubeSearchResults(BaseModel):
    videos: List[YouTubeVideoResult] = Field(description="List of YouTube videos found")
    query: str = Field(description="Original search query")
    total_results: int = Field(description="Total number of results found")


class YouTubeTool:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("YOUTUBE_API_KEY")
        if not self.api_key:
            raise ValueError("YouTube API key is required")
        
        self.base_url = "https://www.googleapis.com/youtube/v3"
    
    def search_videos(self, query: str, max_results: int = 5) -> YouTubeSearchResults:
        """
        Search for YouTube videos based on a query string.
        
        Args:
            query: Search query string
            max_results: Maximum number of results to return (default: 5)
            
        Returns:
            YouTubeSearchResults object containing video information
        """
        try:
            # Search for videos
            search_url = f"{self.base_url}/search"
            search_params = {
                'part': 'snippet',
                'q': query,
                'type': 'video',
                'maxResults': max_results,
                'key': self.api_key,
                'order': 'relevance'
            }
            
            response = requests.get(search_url, params=search_params)
            response.raise_for_status()
            search_data = response.json()
            
            if not search_data.get('items'):
                return YouTubeSearchResults(
                    videos=[],
                    query=query,
                    total_results=0
                )
            
            # Get video IDs for detailed information
            video_ids = [item['id']['videoId'] for item in search_data['items']]
            
            # Get video details (duration, view count, etc.)
            details_url = f"{self.base_url}/videos"
            details_params = {
                'part': 'statistics,contentDetails',
                'id': ','.join(video_ids),
                'key': self.api_key
            }
            
            details_response = requests.get(details_url, params=details_params)
            details_response.raise_for_status()
            details_data = details_response.json()
            
            # Create video results
            videos = []
            for i, item in enumerate(search_data['items']):
                # Find corresponding details
                video_details = None
                for detail in details_data.get('items', []):
                    if detail['id'] == item['id']['videoId']:
                        video_details = detail
                        break
                
                # Format duration
                duration = "Unknown"
                if video_details and 'contentDetails' in video_details:
                    duration = self._format_duration(
                        video_details['contentDetails'].get('duration', 'PT0S')
                    )
                
                # Format view count
                view_count = "Unknown"
                if video_details and 'statistics' in video_details:
                    views = video_details['statistics'].get('viewCount', '0')
                    view_count = self._format_view_count(int(views))
                
                video = YouTubeVideoResult(
                    video_id=item['id']['videoId'],
                    title=item['snippet']['title'],
                    channel=item['snippet']['channelTitle'],
                    description=item['snippet']['description'][:200] + "...",
                    thumbnail_url=item['snippet']['thumbnails']['medium']['url'],
                    duration=duration,
                    view_count=view_count,
                    published_at=item['snippet']['publishedAt'][:10]  # Just the date
                )
                videos.append(video)
            
            return YouTubeSearchResults(
                videos=videos,
                query=query,
                total_results=search_data.get('pageInfo', {}).get('totalResults', len(videos))
            )
            
        except requests.RequestException as e:
            print(f"YouTube API error: {e}")
            return YouTubeSearchResults(
                videos=[],
                query=query,
                total_results=0
            )
    
    def _format_duration(self, duration_str: str) -> str:
        """Convert ISO 8601 duration to readable format (e.g., PT4M13S -> 4:13)"""
        import re
        
        pattern = r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?'
        match = re.match(pattern, duration_str)
        
        if not match:
            return "Unknown"
        
        hours, minutes, seconds = match.groups()
        hours = int(hours) if hours else 0
        minutes = int(minutes) if minutes else 0
        seconds = int(seconds) if seconds else 0
        
        if hours > 0:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        else:
            return f"{minutes}:{seconds:02d}"
    
    def _format_view_count(self, count: int) -> str:
        """Format view count in a readable way (e.g., 1234567 -> 1.2M views)"""
        if count < 1000:
            return f"{count} views"
        elif count < 1000000:
            return f"{count/1000:.1f}K views"
        elif count < 1000000000:
            return f"{count/1000000:.1f}M views"
        else:
            return f"{count/1000000000:.1f}B views"


# Example usage and test function
def test_youtube_integration():
    """Test the YouTube integration"""
    youtube = YouTubeTool()
    results = youtube.search_videos("python programming tutorial", max_results=3)
    
    print(f"Found {results.total_results} results for '{results.query}':")
    for video in results.videos:
        print(f"- {video.title} by {video.channel}")
        print(f"  Duration: {video.duration}, Views: {video.view_count}")
        print(f"  Video ID: {video.video_id}")
        print()


if __name__ == "__main__":
    test_youtube_integration()
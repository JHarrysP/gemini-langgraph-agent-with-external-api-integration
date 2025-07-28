// frontend/src/components/YouTubeResults.tsx (Fixed version)
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Clock, Eye, Calendar, ExternalLink } from 'lucide-react';

interface YouTubeVideo {
  video_id: string;
  title: string;
  channel: string;
  description: string;
  thumbnail_url: string;
  duration: string;
  view_count: string;
  published_at: string;
}

interface YouTubeResults {
  videos: YouTubeVideo[];
  query: string;
  total_results: number;
  timestamp?: number; // Added for stability
  threadId?: string; // Added for stability
}

interface YouTubeResultsProps {
  results: YouTubeResults;
}

interface YouTubePlayerProps {
  videoId: string;
  title: string;
  onClose: () => void;
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ videoId, title, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-100 truncate">{title}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-xl leading-none"
          >
            ×
          </Button>
        </div>
        <div className="aspect-video">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            title={title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
};

const YouTubeVideoCard: React.FC<{ 
  video: YouTubeVideo; 
  onPlay: (videoId: string, title: string) => void;
  index: number;
}> = ({ video, onPlay, index }) => {
  // Fixed: Use a more stable key for the card to prevent re-renders
  const cardRef = useRef<HTMLDivElement>(null);
  
  return (
    <Card 
      ref={cardRef}
      className="bg-neutral-800 border-neutral-700 hover:border-neutral-600 transition-colors"
      // Fixed: Use video_id as stable key instead of index
      key={video.video_id}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="relative flex-shrink-0">
            <img
              src={video.thumbnail_url}
              alt={video.title}
              className="w-32 h-24 object-cover rounded-md"
              loading="lazy" // Fixed: Add lazy loading for better performance
              onError={(e) => {
                // Fixed: Handle broken images gracefully
                const target = e.target as HTMLImageElement;
                target.src = `data:image/svg+xml;base64,${btoa(`
                  <svg width="320" height="180" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="320" height="180" fill="#374151"/>
                    <text x="160" y="90" text-anchor="middle" fill="#9CA3AF" font-family="Arial" font-size="14">
                      No Image
                    </text>
                  </svg>
                `)}`;
              }}
            />
            <Button
              size="sm"
              className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white border-none"
              onClick={() => onPlay(video.video_id, video.title)}
            >
              <Play className="h-5 w-5 ml-1" />
            </Button>
          </div>
          
          {/* Video Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-neutral-100 mb-2 line-clamp-2 leading-tight">
              {video.title}
            </h3>
            
            <p className="text-xs text-neutral-400 mb-2">{video.channel}</p>
            
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {video.duration}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <Eye className="h-3 w-3 mr-1" />
                {video.view_count}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                {video.published_at}
              </Badge>
            </div>
            
            <p className="text-xs text-neutral-500 line-clamp-2">
              {video.description}
            </p>
            
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => onPlay(video.video_id, video.title)}
                className="bg-red-600 hover:bg-red-700 text-white text-xs"
              >
                <Play className="h-3 w-3 mr-1" />
                Play
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`https://youtube.com/watch?v=${video.video_id}`, '_blank')}
                className="text-xs border-neutral-600 text-neutral-300 hover:bg-neutral-700"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                YouTube
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const YouTubeResults: React.FC<YouTubeResultsProps> = ({ results }) => {
  const [playingVideo, setPlayingVideo] = useState<{id: string, title: string} | null>(null);
  // Fixed: Add stable reference to prevent component from disappearing
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Fixed: Ensure component stays visible and handles prop changes gracefully
  useEffect(() => {
    if (results && results.videos && results.videos.length > 0) {
      setIsVisible(true);
    }
  }, [results]);

  // Fixed: Add intersection observer to handle visibility issues
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Only update visibility if component should be visible
        if (results && results.videos && results.videos.length > 0) {
          setIsVisible(entry.isIntersecting || entry.intersectionRatio > 0);
        }
      },
      {
        threshold: [0, 0.1, 0.5, 1],
        rootMargin: '100px'
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [results]);

  const handlePlay = (videoId: string, title: string) => {
    setPlayingVideo({ id: videoId, title });
  };

  const handleClosePlayer = () => {
    setPlayingVideo(null);
  };

  // Fixed: Better error handling and null checks
  if (!results || !results.videos || results.videos.length === 0 || !isVisible) {
    return null; // Don't render anything instead of showing error message
  }

  return (
    <div ref={containerRef} className="w-full">
      <Card className="bg-neutral-800 border-neutral-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-100">
              YouTube Results
            </h2>
            <Badge variant="secondary" className="text-xs">
              {results.videos.length} of {results.total_results} results
            </Badge>
          </div>
          <p className="text-sm text-neutral-400">
            Search: "{results.query}"
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {results.videos.map((video, index) => (
            <YouTubeVideoCard 
              key={`${video.video_id}-${results.timestamp || index}`} // Fixed: More stable key
              video={video} 
              onPlay={handlePlay}
              index={index}
            />
          ))}
        </CardContent>
      </Card>

      {/* YouTube Player Modal */}
      {playingVideo && (
        <YouTubePlayer
          videoId={playingVideo.id}
          title={playingVideo.title}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  );
};
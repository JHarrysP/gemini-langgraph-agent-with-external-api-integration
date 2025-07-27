import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Square, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  language?: string;
  continuous?: boolean;
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ 
  onTranscription, 
  disabled = false,
  language = 'en-US',
  continuous = false
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [confidence, setConfidence] = useState<number>(0);
  
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

   // Check browser support on component mount
  useEffect(() => {
    const checkSupport = () => {
      const hasGetUserMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
      const hasWebkitSpeechRecognition = 'webkitSpeechRecognition' in window;
      const hasSpeechRecognition = 'SpeechRecognition' in window;
      
      return hasGetUserMedia && (hasWebkitSpeechRecognition || hasSpeechRecognition);
    };

    setIsSupported(checkSupport());
  }, []);

  const cleanupResources = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
      recognitionRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      setIsProcessing(true);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });
      
      streamRef.current = stream;
      
      // Use Web Speech API for real-time transcription
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = continuous;
        recognition.interimResults = false;
        recognition.lang = language;
        recognition.maxAlternatives = 1;
        
        let finalTranscript = '';
        
        recognition.onstart = () => {
          setIsRecording(true);
          setIsProcessing(false);
          setError(null);
        };
        
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let transcript = '';
          let maxConfidence = 0;
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              transcript += result[0].transcript;
              maxConfidence = Math.max(maxConfidence, result[0].confidence || 0);
            }
          }
          
          if (transcript.trim()) {
            finalTranscript += transcript;
            setConfidence(maxConfidence);
            
            // For continuous mode, send each final result immediately
            if (continuous) {
              onTranscription(transcript.trim());
            }
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          
          let errorMessage = 'Speech recognition error';
          switch (event.error) {
            case 'no-speech':
              errorMessage = 'No speech detected. Try speaking again.';
              break;
            case 'audio-capture':
              errorMessage = 'Microphone not available';
              break;
            case 'not-allowed':
              errorMessage = 'Microphone access denied';
              break;
            case 'network':
              errorMessage = 'Network error occurred';
              break;
            default:
              errorMessage = `Recognition error: ${event.error}`;
          }
          
          setError(errorMessage);
          setIsRecording(false);
          setIsProcessing(false);
          cleanupResources();
        };

        recognition.onend = () => {
          // Send the final transcript if not in continuous mode
          if (!continuous && finalTranscript.trim()) {
            onTranscription(finalTranscript.trim());
          }
          
          setIsRecording(false);
          setIsProcessing(false);
          cleanupResources();
        };

        // Auto-stop after 30 seconds if not continuous
        if (!continuous) {
          timeoutRef.current = setTimeout(() => {
            if (recognitionRef.current) {
              recognitionRef.current.stop();
            }
          }, 30000);
        }

        recognitionRef.current = recognition;
        recognition.start();
        
      } else {
        throw new Error('Speech recognition not supported in this browser');
      }
      
    } catch (err) {
      console.error('Error starting recording:', err);
      let errorMessage = 'Failed to start recording';
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone and try again.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setIsRecording(false);
      setIsProcessing(false);
      cleanupResources();
    }
  };

  const stopRecording = useCallback(() => {
    setIsProcessing(true);
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Recognition might already be stopped
        setIsRecording(false);
        setIsProcessing(false);
        cleanupResources();
      }
    } else {
      setIsRecording(false);
      setIsProcessing(false);
      cleanupResources();
    }
  }, [cleanupResources]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  if (!isSupported) {
    return null; // Don't render if not supported
  }

  const getButtonColor = () => {
    if (isRecording) return 'text-red-500 hover:text-red-400 hover:bg-red-500/10';
    if (isProcessing) return 'text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10';
    if (error) return 'text-red-400 hover:text-red-300 hover:bg-red-500/10';
    return 'text-neutral-400 hover:text-blue-400 hover:bg-blue-500/10';
  };

  const getButtonTitle = () => {
    if (isRecording) return 'Stop recording (click to finish)';
    if (isProcessing) return 'Processing speech...';
    if (error) return 'Voice input error - click to retry';
    return 'Start voice input';
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`transition-all duration-200 ${getButtonColor()} ${
          isRecording ? 'animate-pulse' : ''
        }`}
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled || isProcessing}
        title={getButtonTitle()}
      >
        {isRecording ? (
          <Square className="h-5 w-5" />
        ) : isProcessing ? (
          <MicOff className="h-5 w-5 animate-spin" />
        ) : error ? (
          <AlertCircle className="h-5 w-5" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </Button>
      
      {/* Status indicators */}
      {isRecording && (
        <div className="text-xs text-red-400 animate-pulse text-center max-w-[120px]">
          Recording...
        </div>
      )}
      
      {isProcessing && !isRecording && (
        <div className="text-xs text-yellow-400 text-center max-w-[120px]">
          Starting...
        </div>
      )}
      
      {error && !isRecording && !isProcessing && (
        <div className="text-xs text-red-400 text-center max-w-[120px] leading-tight">
          {error.length > 30 ? `${error.substring(0, 30)}...` : error}
        </div>
      )}
      
      {confidence > 0 && !isRecording && !error && (
        <div className="text-xs text-green-400 text-center">
          {Math.round(confidence * 100)}% confident
        </div>
      )}
    </div>
  );
};
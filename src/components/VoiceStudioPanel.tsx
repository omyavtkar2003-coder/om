import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Mic,
  PhoneCall,
  PhoneOff,
  Send,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import {
  bytesToBase64,
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
} from '../lib/liveAudio';

interface VoiceStudioPanelProps {
  onApplyPromptToStory: (promptText: string) => void;
}

interface TranscriptEntry {
  id: string;
  speaker: 'You' | 'Gemini Producer';
  text: string;
}

export function VoiceStudioPanel({ onApplyPromptToStory }: VoiceStudioPanelProps) {
  // 1. Live Voice Conversation State (gemini-3.8-live)
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [liveVoice, setLiveVoice] = useState<'Zephyr' | 'Kore' | 'Charon' | 'Fenrir' | 'Puck'>('Zephyr');
  const [liveLog, setLiveLog] = useState<TranscriptEntry[]>([]);
  const [liveNoteInput, setLiveNoteInput] = useState('');
  const [liveError, setLiveError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // 2. Audio Transcription State (gemini-3.5-transcribe)
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptResult, setTranscriptResult] = useState('');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const stopLiveSession = () => {
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      void outputCtxRef.current.close();
      outputCtxRef.current = null;
    }
    nextStartTimeRef.current = 0;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    setLiveStatus('idle');
  };

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, []);

  const schedulePcmOutput = (base64Pcm: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const floats = pcm16Base64ToFloat32(base64Pcm);
    if (floats.length === 0) return;

    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now + 0.02;
    }
    src.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;

    activeSourcesRef.current.add(src);
    src.onended = () => {
      activeSourcesRef.current.delete(src);
    };
  };

  const handleStartLive = async () => {
    if (liveStatus !== 'idle') return;
    setLiveError(null);
    setLiveStatus('connecting');

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = micStream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/api/live?voice=${liveVoice}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(micStream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (ev) => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) return;
          const samples = ev.inputBuffer.getChannelData(0);
          const b64 = float32ToPcm16Base64(samples);
          wsRef.current.send(JSON.stringify({ audio: b64 }));
        };
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as {
          ready?: boolean;
          audio?: string;
          interrupted?: boolean;
          inputTranscript?: string;
          outputTranscript?: string;
          error?: string;
        };

        if (msg.ready) {
          setLiveStatus('connected');
        }
        if (msg.error) {
          setLiveError(msg.error);
        }
        if (msg.audio) {
          schedulePcmOutput(msg.audio);
        }
        if (msg.interrupted) {
          for (const src of activeSourcesRef.current) {
            try {
              src.stop();
            } catch {
              // ignore
            }
          }
          activeSourcesRef.current.clear();
          if (outputCtxRef.current) {
            nextStartTimeRef.current = outputCtxRef.current.currentTime;
          }
        }
        if (msg.inputTranscript?.trim()) {
          setLiveLog((prev) => [
            ...prev.slice(-16),
            { id: `in-${Date.now()}-${Math.random()}`, speaker: 'You', text: msg.inputTranscript!.trim() },
          ]);
        }
        if (msg.outputTranscript?.trim()) {
          setLiveLog((prev) => [
            ...prev.slice(-16),
            {
              id: `out-${Date.now()}-${Math.random()}`,
              speaker: 'Gemini Producer',
              text: msg.outputTranscript!.trim(),
            },
          ]);
        }
      };

      ws.onerror = () => {
        setLiveError('Live voice WebSocket connection failed.');
        stopLiveSession();
      };

      ws.onclose = () => {
        stopLiveSession();
      };
    } catch (err) {
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Microphone access is required for real-time voice conversations.'
      );
      stopLiveSession();
    }
  };

  const handleSendTextToLive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveNoteInput.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    const txt = liveNoteInput.trim();
    wsRef.current.send(JSON.stringify({ text: txt }));
    setLiveLog((prev) => [...prev.slice(-16), { id: `u-${Date.now()}`, speaker: 'You', text: txt }]);
    setLiveNoteInput('');
  };

  const sendAudioBlobToTranscribe = async (blob: Blob, mimeType: string) => {
    setTranscribeError(null);
    setIsTranscribing(true);
    try {
      const arr = await blob.arrayBuffer();
      const b64 = bytesToBase64(new Uint8Array(arr));
      const res = await fetch('/api/audio/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: b64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Audio transcription failed');
      }
      setTranscriptResult(data.text);
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Transcription error');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleToggleRecordClip = async () => {
    if (isRecordingClip && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingClip(false);
      return;
    }

    setTranscribeError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        void sendAudioBlobToTranscribe(blob, mimeType);
      };

      recorder.start();
      setIsRecordingClip(true);
    } catch (err) {
      setTranscribeError(
        err instanceof Error ? err.message : 'Microphone permission is required to record audio.'
      );
    }
  };

  const handleUploadAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void sendAudioBlobToTranscribe(file, file.type || 'audio/mp3');
    e.target.value = '';
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left: Real-Time Bidirectional Voice Conversation (gemini-3.8-live) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Live Voice Brainstorm (Gemini Live)
            </h3>
            <p className="text-xs text-slate-500">
              Speak naturally in Hindi or English to brainstorm hooks, character twists, and scripts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Live assistant voice"
              value={liveVoice}
              disabled={liveStatus !== 'idle'}
              onChange={(e) => setLiveVoice(e.target.value as typeof liveVoice)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            >
              <option value="Zephyr">Zephyr</option>
              <option value="Kore">Kore</option>
              <option value="Charon">Charon</option>
              <option value="Fenrir">Fenrir</option>
              <option value="Puck">Puck</option>
            </select>
            {liveStatus === 'idle' ? (
              <button
                type="button"
                onClick={handleStartLive}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-orange-800 transition-colors whitespace-nowrap"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                <span>Start Voice Session</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopLiveSession}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-800 transition-colors whitespace-nowrap"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                <span>{liveStatus === 'connecting' ? 'Connecting...' : 'End Session'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="h-52 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
          {liveLog.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-slate-400">
              {liveStatus === 'connected'
                ? 'Listening — ask for a Krishna Leela hook, horror twist, or Ramayana story idea.'
                : 'Start a live voice conversation to speak with your AI creative producer in real time.'}
            </div>
          ) : (
            liveLog.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg px-3 py-2 ${
                  item.speaker === 'You'
                    ? 'bg-white border border-slate-200 text-slate-800'
                    : 'bg-orange-50 border border-orange-200 text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-semibold text-[11px] text-slate-600">{item.speaker}</span>
                  {item.speaker === 'Gemini Producer' && (
                    <button
                      type="button"
                      onClick={() => onApplyPromptToStory(item.text)}
                      className="text-[11px] font-medium text-orange-700 hover:text-orange-800"
                    >
                      Use as Story Prompt
                    </button>
                  )}
                </div>
                <p className="leading-relaxed">{item.text}</p>
              </div>
            ))
          )}
        </div>

        {liveStatus === 'connected' && (
          <form onSubmit={handleSendTextToLive} className="flex gap-2">
            <input
              type="text"
              value={liveNoteInput}
              onChange={(e) => setLiveNoteInput(e.target.value)}
              placeholder="Or type a quick cue while speaking..."
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-orange-700 focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </form>
        )}

        {liveError && (
          <p role="alert" className="text-xs text-red-700">
            {liveError}
          </p>
        )}
      </section>

      {/* Right: Audio Transcription Studio (gemini-3.5-transcribe) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <h3 className="text-base font-semibold text-slate-900">
            Audio Transcription &amp; Voice Notes
          </h3>
          <p className="text-xs text-slate-500">
            Record a story idea via microphone or upload an audio clip to transcribe with Gemini 3.5 Transcribe.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleRecordClip}
            disabled={isTranscribing}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              isRecordingClip
                ? 'bg-red-700 text-white hover:bg-red-800'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {isRecordingClip ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            <span>{isRecordingClip ? 'Stop & Transcribe' : 'Record Voice Note'}</span>
          </button>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap">
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Audio File</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleUploadAudioFile}
              className="sr-only"
            />
          </label>

          {isTranscribing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <AudioLines className="h-3.5 w-3.5 text-orange-700" />
              Transcribing speech...
            </span>
          )}
        </div>

        <div>
          <label htmlFor="transcribed-output" className="block text-xs font-medium text-slate-700 mb-1">
            Transcribed Hindi / English Text
          </label>
          <textarea
            id="transcribed-output"
            rows={5}
            value={transcriptResult}
            onChange={(e) => setTranscriptResult(e.target.value)}
            placeholder="Your recorded or uploaded speech transcript appears here..."
            className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={!transcriptResult.trim()}
            onClick={() => onApplyPromptToStory(transcriptResult.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-orange-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Send Transcript to Story Prompt</span>
          </button>
        </div>

        {transcribeError && (
          <p role="alert" className="text-xs text-red-700">
            {transcribeError}
          </p>
        )}
      </section>
    </div>
  );
}

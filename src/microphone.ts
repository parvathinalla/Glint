import { useCallback, useEffect, useRef, useState } from "react";
import {
  VoiceTurnDetector,
  pcm16Bytes,
  voiceWav,
} from "../shared/voice-turn.ts";

/** Streaming sink: live PCM16 mono plus a marker at every turn end. */
export type MicStream = {
  samples: (pcm: Uint8Array) => void;
  turnEnd: () => void;
};
/** One explicit microphone session, with local turn detection and bounded audio. */
export function useMicrophone(
  onReady: (audio: Blob) => void,
  onProblem: (message: string) => void,
  onSpeechStart: () => void,
  speaking: boolean,
  streaming?: MicStream,
) {
  const [enabled, setEnabled] = useState(false),
    [recording, setRecording] = useState(false),
    [preparing, setPreparing] = useState(false);
  const stream = useRef<MediaStream | null>(null),
    context = useRef<AudioContext | null>(null),
    node = useRef<AudioWorkletNode | null>(null);
  const generation = useRef(0);
  const callbacks = useRef({
    onReady,
    onProblem,
    onSpeechStart,
    speaking,
    streaming,
  });
  callbacks.current = {
    onReady,
    onProblem,
    onSpeechStart,
    speaking,
    streaming,
  };
  const cancel = useCallback(() => {
    generation.current++;
    if (node.current) {
      node.current.port.onmessage = null;
      node.current.disconnect();
      node.current.port.close();
      node.current = null;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
    setEnabled(false);
    setRecording(false);
    setPreparing(false);
  }, []);
  const start = useCallback(async () => {
    cancel();
    const epoch = generation.current;
    setPreparing(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode)
        throw Error("unsupported");
      const audio = new AudioContext({ sampleRate: 24000 });
      context.current = audio;
      await audio.resume();
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (generation.current !== epoch) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      await audio.audioWorklet.addModule("/voice-capture.js");
      if (generation.current !== epoch) return;
      const capture = new AudioWorkletNode(audio, "glint-voice-capture");
      node.current = capture;
      const source = audio.createMediaStreamSource(media),
        mute = audio.createGain();
      mute.gain.value = 0;
      source.connect(capture);
      capture.connect(mute);
      mute.connect(audio.destination);
      const detector = new VoiceTurnDetector(audio.sampleRate);
      capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (generation.current !== epoch) return;
        const turn = detector.push(
          event.data,
          callbacks.current.speaking ? 0.065 : 0.014,
        );
        if (turn.started) {
          setRecording(true);
          callbacks.current.onSpeechStart();
        }
        const sink = callbacks.current.streaming;
        if (turn.live.length && sink)
          for (const frame of turn.live)
            sink.samples(pcm16Bytes(frame, audio.sampleRate));
        if (turn.audio) {
          callbacks.current.onReady(voiceWav(turn.audio, audio.sampleRate));
        }
        if (turn.ended) {
          setRecording(false);
          sink?.turnEnd();
        }
      };
      media.getAudioTracks()[0].addEventListener("ended", () => {
        if (generation.current === epoch) {
          cancel();
          callbacks.current.onProblem(
            "Microphone access ended. Start voice again when ready.",
          );
        }
      });
      setPreparing(false);
      setEnabled(true);
    } catch {
      if (generation.current === epoch) {
        cancel();
        callbacks.current.onProblem(
          "Microphone unavailable. Allow access in your browser, or type below.",
        );
      }
    }
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return { enabled, recording, preparing, start, cancel };
}

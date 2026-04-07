import { useEffect, useMemo, useRef, useState } from 'react';

const GUIDED_DURATION_MS = 4 * 60 * 1000;
const TOTAL_DURATION_MS = 6 * 60 * 1000;
const PHASE_DURATION_MS = 1500;
const MINUTE_MS = 60 * 1000;
const MINUTE_BEEP_DURATION_MS = 140;
const MINUTE_BEEP_GAP_MS = 180;
const END_TONE_DURATION_MS = 700;
const DEFAULT_SETTINGS = {
  inhale: { frequency: 580, volume: 0.99, durationMs: 180 },
  exhale: { frequency: 360, volume: 0.99, durationMs: 180 },
  minute: { frequency: 2000, volume: 0.99, durationMs: 140 },
  end: { frequency: 2000, volume: 0.99, durationMs: END_TONE_DURATION_MS },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatClock(ms, maxMs = TOTAL_DURATION_MS, rounding = 'floor') {
  const safeMs = clamp(ms, 0, maxMs);
  const totalSeconds =
    rounding === 'ceil' ? Math.ceil(safeMs / 1000) : Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getGuidedPhase(elapsedMs) {
  return Math.floor(elapsedMs / PHASE_DURATION_MS) % 2 === 0 ? 'In' : 'Out';
}

function getTaskStage(elapsedMs, status) {
  if (status === 'complete') {
    return 'Done';
  }

  if (elapsedMs >= GUIDED_DURATION_MS) {
    return 'Observation';
  }

  return getGuidedPhase(elapsedMs);
}

function createAudioController() {
  let audioContext = null;
  let activeNodes = [];
  let timeouts = [];

  const ensureContext = () => {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not available in this browser.');
      }
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    return audioContext;
  };

  const stopAll = () => {
    timeouts.forEach(window.clearTimeout);
    timeouts = [];
    activeNodes.forEach(({ oscillator, gainNode }) => {
      try {
        oscillator.stop();
      } catch {
        // Ignore repeated stop attempts while stopping scheduled tones.
      }
      oscillator.disconnect();
      gainNode.disconnect();
    });
    activeNodes = [];
  };

  const playTone = ({ frequency, volume, durationMs, delayMs = 0 }) => {
    const context = ensureContext();
    const startAt = context.currentTime + delayMs / 1000;
    const stopAt = startAt + durationMs / 1000;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.linearRampToValueAtTime(volume, startAt + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.02);

    activeNodes.push({ oscillator, gainNode });
    const cleanupId = window.setTimeout(() => {
      activeNodes = activeNodes.filter((entry) => entry.oscillator !== oscillator);
      oscillator.disconnect();
      gainNode.disconnect();
    }, delayMs + durationMs + 100);
    timeouts.push(cleanupId);
  };

  return {
    playCue(settings, phase) {
      playTone(phase === 'In' ? settings.inhale : settings.exhale);
    },
    playMinute(settings, minuteNumber) {
      for (let index = 0; index < minuteNumber; index += 1) {
        playTone({
          ...settings.minute,
          delayMs: index * (MINUTE_BEEP_DURATION_MS + MINUTE_BEEP_GAP_MS),
        });
      }
    },
    playEnd(settings) {
      playTone(settings.end);
    },
    stopAll,
  };
}

function NumberField({ label, suffix, min, max, step, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-input">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span>{suffix}</span>
      </div>
    </label>
  );
}

export default function App() {
  const [status, setStatus] = useState('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const frameRef = useRef(null);
  const anchorTimeRef = useRef(0);
  const baseElapsedRef = useRef(0);
  const lastElapsedRef = useRef(0);
  const completionHandledRef = useRef(false);
  const audioRef = useRef(null);

  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = createAudioController();
  }

  const currentStage = useMemo(() => getTaskStage(elapsedMs, status), [elapsedMs, status]);
  const remainingMs = TOTAL_DURATION_MS - elapsedMs;
  const guidedRemainingMs = Math.max(GUIDED_DURATION_MS - elapsedMs, 0);
  const completionPct = clamp((elapsedMs / TOTAL_DURATION_MS) * 100, 0, 100);
  const guidedPct = clamp((elapsedMs / GUIDED_DURATION_MS) * 100, 0, 100);
  const isObservation = elapsedMs >= GUIDED_DURATION_MS && status !== 'complete';

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      audioRef.current?.stopAll();
    };
  }, []);

  useEffect(() => {
    if (status !== 'running') {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return undefined;
    }

    const tick = (now) => {
      const nextElapsed = Math.min(
        TOTAL_DURATION_MS,
        baseElapsedRef.current + (now - anchorTimeRef.current),
      );
      const previousElapsed = lastElapsedRef.current;

      for (
        let boundary = PHASE_DURATION_MS;
        boundary <= nextElapsed && boundary <= GUIDED_DURATION_MS;
        boundary += PHASE_DURATION_MS
      ) {
        if (boundary > previousElapsed) {
          const phase = getGuidedPhase(boundary);
          audioRef.current?.playCue(settings, phase);
        }
      }

      for (
        let minuteMark = MINUTE_MS;
        minuteMark <= nextElapsed && minuteMark <= GUIDED_DURATION_MS;
        minuteMark += MINUTE_MS
      ) {
        if (minuteMark > previousElapsed) {
          audioRef.current?.playMinute(settings, minuteMark / MINUTE_MS);
        }
      }

      if (nextElapsed >= TOTAL_DURATION_MS) {
        if (!completionHandledRef.current) {
          completionHandledRef.current = true;
          audioRef.current?.playEnd(settings);
        }
        lastElapsedRef.current = TOTAL_DURATION_MS;
        baseElapsedRef.current = TOTAL_DURATION_MS;
        setElapsedMs(TOTAL_DURATION_MS);
        setStatus('complete');
        return;
      }

      lastElapsedRef.current = nextElapsed;
      setElapsedMs(nextElapsed);
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [settings, status]);

  const handleStart = () => {
    audioRef.current?.stopAll();
    completionHandledRef.current = false;
    baseElapsedRef.current = 0;
    lastElapsedRef.current = 0;
    setElapsedMs(0);
    anchorTimeRef.current = performance.now();
    audioRef.current?.playCue(settings, 'In');
    setStatus('running');
  };

  const handlePause = () => {
    if (status !== 'running') {
      return;
    }
    baseElapsedRef.current = elapsedMs;
    lastElapsedRef.current = elapsedMs;
    audioRef.current?.stopAll();
    setStatus('paused');
  };

  const handleResume = () => {
    if (status !== 'paused') {
      return;
    }
    anchorTimeRef.current = performance.now();
    baseElapsedRef.current = elapsedMs;
    lastElapsedRef.current = elapsedMs;
    setStatus('running');
  };

  const handleReset = () => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    audioRef.current?.stopAll();
    completionHandledRef.current = false;
    anchorTimeRef.current = 0;
    baseElapsedRef.current = 0;
    lastElapsedRef.current = 0;
    setElapsedMs(0);
    setStatus('idle');
  };

  const updateSoundSetting = (soundKey, field, nextValue) => {
    const normalizedValue =
      field === 'volume'
        ? clamp(Number.isFinite(nextValue) ? nextValue : 0, 0, 1)
        : clamp(Number.isFinite(nextValue) ? nextValue : 0, 50, 2000);

    setSettings((current) => ({
      ...current,
      [soundKey]: {
        ...current[soundKey],
        [field]: normalizedValue,
      },
    }));
  };

  const startDisabled = status === 'running';
  const pauseDisabled = status !== 'running';
  const resumeDisabled = status !== 'paused';
  const resetDisabled = status === 'idle' && elapsedMs === 0;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-top">
          <div>
            <p className="eyebrow">BDE Protocol</p>
            <h1>BDE hyperventilation task</h1>
          </div>
          <div className={`stage-pill ${isObservation ? 'observation' : ''}`}>
            {currentStage}
          </div>
        </div>

        <p className="intro">
          Four minutes of guided hyperventilation are followed by two minutes of silent
          observation before the final completion tone.
        </p>

        <div className="timeline-card">
          <div className="timeline-row">
            <div>
              <span className="timeline-label">Guided breathing</span>
              <strong>{formatClock(guidedRemainingMs, GUIDED_DURATION_MS, 'ceil')} left</strong>
            </div>
            <span className="timeline-tag">0:00-4:00</span>
          </div>
          <div className="timeline-row">
            <div>
              <span className="timeline-label">Silent observation</span>
              <strong>4:00-6:00</strong>
            </div>
            <span className="timeline-tag muted">No cue beeps</span>
          </div>
          <div className="guided-track" aria-hidden="true">
            <div className="guided-fill" style={{ width: `${guidedPct}%` }} />
          </div>
        </div>

        <div className="status-grid">
          <div className="status-panel">
            <span>Remaining</span>
            <strong>{formatClock(remainingMs, TOTAL_DURATION_MS, 'ceil')}</strong>
          </div>
          <div className="status-panel">
            <span>Elapsed</span>
            <strong>{formatClock(elapsedMs, TOTAL_DURATION_MS, 'floor')}</strong>
          </div>
          <div className="status-panel accent">
            <span>Task stage</span>
            <strong>{currentStage}</strong>
          </div>
        </div>

        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${completionPct}%` }} />
        </div>

        <div className="controls">
          <button type="button" onClick={handleStart} disabled={startDisabled}>
            {status === 'complete' ? 'Restart' : 'Start'}
          </button>
          <button type="button" onClick={handlePause} disabled={pauseDisabled}>
            Pause
          </button>
          <button type="button" onClick={handleResume} disabled={resumeDisabled}>
            Resume
          </button>
          <button type="button" onClick={handleReset} disabled={resetDisabled}>
            Reset
          </button>
        </div>
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Tone Controls</p>
            <h2>Fine-tune the cue profile</h2>
          </div>
          <p className="helper">
            Adjust frequency and loudness for breathing cues, minute markers, and the
            final tone. New values apply immediately to future sounds.
          </p>
        </div>

        <div className="sound-grid">
          {[
            ['inhale', 'In cue'],
            ['exhale', 'Out cue'],
            ['minute', 'Minute beep'],
            ['end', 'Final tone'],
          ].map(([soundKey, label]) => (
            <article className="sound-card" key={soundKey}>
              <div className="sound-card-header">
                <h3>{label}</h3>
                <span>{soundKey === 'end' ? '6:00' : soundKey === 'minute' ? '1:00-4:00' : '0:00-4:00'}</span>
              </div>
              <NumberField
                label="Frequency"
                suffix="Hz"
                min={50}
                max={2000}
                step={1}
                value={settings[soundKey].frequency}
                onChange={(value) => updateSoundSetting(soundKey, 'frequency', value)}
              />
              <NumberField
                label="Volume"
                suffix=""
                min={0}
                max={1}
                step={0.01}
                value={settings[soundKey].volume}
                onChange={(value) => updateSoundSetting(soundKey, 'volume', value)}
              />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

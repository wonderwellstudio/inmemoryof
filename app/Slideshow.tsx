"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Maximize, Pause, Play, Settings, Volume2, VolumeX } from "lucide-react";
import items from "./media-manifest.json";

type MediaItem = (typeof items)[number];
type NavigationDirection = "forward" | "reverse";

const SWIPE_THRESHOLD = 50;

export function Slideshow() {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [direction, setDirection] = useState<NavigationDirection>("forward");
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [supportsHover, setSupportsHover] = useState(true);
  const [muted, setMuted] = useState(false);
  const [filenameCopied, setFilenameCopied] = useState(false);
  const [filenameExpanded, setFilenameExpanded] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; interactive: boolean } | null>(null);
  const current = items[index] as MediaItem;

  const move = useCallback((direction: number) => {
    setDirection(direction > 0 ? "forward" : "reverse");
    setPrevious(index);
    setIndex((index + direction + items.length) % items.length);
    setFilenameExpanded(false);
    setFilenameCopied(false);
  }, [index]);

  const beginTouch = (event: React.TouchEvent<HTMLElement>) => {
    if (!started || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const target = event.target as HTMLElement;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      interactive: Boolean(target.closest("button, nav, a, input, select, textarea")),
    };
  };

  const finishTouch = (event: React.TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
      move(deltaX < 0 ? 1 : -1);
      return;
    }

    if (start.interactive || Math.hypot(deltaX, deltaY) > 12) return;
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) return;
    move(touch.clientX >= bounds.left + bounds.width / 2 ? 1 : -1);
  };

  useEffect(() => {
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 641px)");
    const updateHoverSupport = () => setSupportsHover(hoverQuery.matches);
    updateHoverSupport();
    hoverQuery.addEventListener("change", updateHoverSupport);
    return () => hoverQuery.removeEventListener("change", updateHoverSupport);
  }, []);

  useEffect(() => {
    if (!started || !playing || current.type !== "image") return;
    const timer = window.setTimeout(() => move(1), current.duration);
    return () => window.clearTimeout(timer);
  }, [current, move, playing, started]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === " ") { event.preventDefault(); setPlaying((value) => !value); }
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
      if (event.key.toLowerCase() === "m") setMuted((value) => !value);
      if (event.key.toLowerCase() === "f") rootRef.current?.requestFullscreen?.();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [move]);

  const start = () => {
    setStarted(true);
    setPlaying(true);
    rootRef.current?.requestFullscreen?.().catch(() => undefined);
    navigator.wakeLock?.request("screen").catch(() => undefined);
  };

  const copyFilename = async () => {
    const usesTapInteraction = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 640px)").matches;

    if (usesTapInteraction && !filenameExpanded) {
      setFilenameExpanded(true);
      return;
    }

    await navigator.clipboard.writeText(current.originalName);
    setFilenameCopied(true);
    window.setTimeout(() => {
      setFilenameCopied(false);
      setFilenameExpanded(false);
    }, 800);
  };

  return (
    <main
      ref={rootRef}
      className={`slideshow navigation-${direction}`}
      onTouchStart={beginTouch}
      onTouchEnd={finishTouch}
      onTouchCancel={() => { touchStartRef.current = null; }}
    >
      {previous !== null && <MediaLayer key={`previous-${previous}`} item={items[previous] as MediaItem} className={`leaving leaving-${direction}`} muted />}
      <MediaLayer key={`current-${index}`} item={current} className={started ? `entering entering-${direction}` : "visible"} playing={started && playing} muted={muted} onEnded={() => move(1)} />

      {started && (
        <>
        <div className="slideshow-brand" aria-label="In loving memory of Guy Gauvreau">
          <span>In loving memory</span>
          <strong>Guy Gauvreau</strong>
        </div>
        <button
          className={`filename-label ${filenameExpanded ? "expanded" : ""}`}
          type="button"
          onClick={copyFilename}
          title="Copy filename"
          aria-expanded={!supportsHover ? filenameExpanded : undefined}
          aria-label={!supportsHover && !filenameExpanded ? "Show filename" : `Copy filename ${current.originalName}`}
        >
          <span className="filename-counter">{index + 1} / {items.length}</span>
          <span className="filename-details">
            <span className="filename-text">{current.originalName}</span>
            <span className="copy-status" aria-hidden="true">{filenameCopied ? <Check /> : <Copy />}</span>
            <span className="sr-only" aria-live="polite">{filenameCopied ? "Filename copied" : ""}</span>
          </span>
        </button>
        </>
      )}

      {!started && (
        <section className="welcome" aria-label="Start memorial slideshow">
          <div className="welcome-panel">
            <p className="eyebrow">In loving memory</p>
            <h1>Guy Gauvreau</h1>
            <p className="welcome-copy">Photos and memories shared by family and friends</p>
            <button className="start-button" type="button" onClick={start}>Start slideshow</button>
            <p className="start-note">Starts full screen with video audio enabled</p>
          </div>
        </section>
      )}

      {started && (
        <nav
          className={`controls ${controlsExpanded || !supportsHover ? "expanded" : ""}`}
          aria-label="Slideshow controls"
          onMouseEnter={() => supportsHover && setControlsExpanded(true)}
          onMouseLeave={() => supportsHover && setControlsExpanded(false)}
          onFocus={() => supportsHover && setControlsExpanded(true)}
          onBlur={(event) => {
            if (supportsHover && !event.currentTarget.contains(event.relatedTarget)) setControlsExpanded(false);
          }}
        >
          <div className="control-actions" aria-hidden={supportsHover && !controlsExpanded}>
            <button className="icon-control" onClick={() => move(-1)} aria-label="Previous item"><ChevronLeft aria-hidden="true" /></button>
            <button className="play icon-control" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
            <button className="icon-control" onClick={() => move(1)} aria-label="Next item"><ChevronRight aria-hidden="true" /></button>
            <button className="icon-control" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute videos" : "Mute videos"} title={muted ? "Unmute videos" : "Mute videos"}>
              {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </button>
            <button className="icon-control fullscreen-control" onClick={() => rootRef.current?.requestFullscreen?.()} aria-label="Enter full screen" title="Enter full screen">
              <Maximize aria-hidden="true" />
            </button>
          </div>
          <button
            className="controls-toggle"
            type="button"
            aria-label={controlsExpanded ? "Close slideshow controls" : "Open slideshow controls"}
            aria-expanded={controlsExpanded || !supportsHover}
            onClick={() => setControlsExpanded((value) => !value)}
          >
            <Settings aria-hidden="true" />
          </button>
        </nav>
      )}
    </main>
  );
}

function MediaLayer({ item, className, playing = false, muted = true, onEnded }: { item: MediaItem; className: string; playing?: boolean; muted?: boolean; onEnded?: () => void; }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const backdropVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const backdrop = backdropVideoRef.current;
    if (playing) {
      video.play().catch(() => undefined);
      if (backdrop) {
        backdrop.currentTime = video.currentTime;
        backdrop.play().catch(() => undefined);
      }
    } else {
      video.pause();
      backdrop?.pause();
    }
  }, [playing]);

  return (
    <div className={`media-layer ${className}`}>
      {item.type === "image" ? (
        <><img className="image-backdrop" src={item.src} alt="" aria-hidden="true" /><img className="image-main" src={item.src} alt="Memorial photograph" /></>
      ) : (
        <>
          <video ref={backdropVideoRef} className="video-backdrop" src={item.src} muted playsInline preload="auto" aria-hidden="true" />
          <video ref={videoRef} className="video-main" src={item.src} muted={muted} playsInline onEnded={onEnded} preload="auto" />
        </>
      )}
    </div>
  );
}

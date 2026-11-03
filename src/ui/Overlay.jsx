import { useEffect, useMemo, useRef, useState } from "react";
import { book, hitElements, PHASE, useStore } from "../store/useStore";
import { activateHit, director, registerVeil } from "../scene/director";
import { BACK_SEALS } from "../textures/proceduralArt";
import { portfolio } from "../content/portfolio";

const Icon = ({ name }) => {
  const paths = {
    sound: "M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
    muted: "M4 9v6h4l5 4V5L8 9H4zm16.6 3 2.2-2.2-1.4-1.4-2.2 2.2-2.2-2.2-1.4 1.4 2.2 2.2-2.2 2.2 1.4 1.4 2.2-2.2 2.2 2.2 1.4-1.4z",
    fullscreen: "M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z",
    help: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 16h-2v-2h2v2zm1.6-6.6-.9.9c-.7.7-1.2 1.3-1.2 2.7h-2v-.5c0-1.1.5-2.1 1.2-2.8l1.2-1.3a1.9 1.9 0 0 0 .6-1.4 2 2 0 0 0-4 0H7.5a4.5 4.5 0 0 1 9 0c0 .9-.4 1.7-.9 2.4z",
    close: "M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7 10.6 10.6 5.7 15.5l1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z",
    left: "M15.4 4.6 8 12l7.4 7.4 1.4-1.4L10.8 12l6-6z",
    right: "M8.6 4.6 7.2 6l6 6-6 6 1.4 1.4L16 12z"
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d={paths[name]} />
    </svg>
  );
};

const Loader = () => {
  const ready = useStore((s) => s.sceneReady);
  const assets = useStore((s) => s.ready);
  const progress = useStore((s) => s.loadProgress) * 0.7 + (assets ? 0.2 : 0) + (ready ? 0.1 : 0);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => setGone(true), 900);
    return () => clearTimeout(id);
  }, [ready]);
  if (gone) return null;
  // The ensō turns with a CSS transform, which runs on the compositor and stays
  // smooth while the main thread inks pages. Progress is the bar beneath it.
  return (
    <div className={`loader ${ready ? "loader--done" : ""}`} role="status" aria-live="polite">
      <svg viewBox="0 0 200 200" className="loader__enso" aria-hidden="true">
        <defs>
          <filter id="brush">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
          </filter>
        </defs>
        <path
          d="M100 22c44 0 78 34 78 78s-34 78-78 78-78-34-78-78c0-30 16-55 40-68"
          fill="none"
          stroke="currentColor"
          strokeWidth="13"
          strokeLinecap="round"
          filter="url(#brush)"
        />
      </svg>
      <p className="loader__label">Inking the pages</p>
      <span className="loader__bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.max(0.06, progress)})` }} />
      </span>
    </div>
  );
};

const HintToast = () => {
  const ready = useStore((s) => s.sceneReady);
  const phase = useStore((s) => s.phase);
  const hintSeen = useStore((s) => s.hintSeen);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ready || hintSeen) return undefined;
    const id = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(id);
  }, [ready, hintSeen]);
  const onShelf = phase === PHASE.SHELF_AMBIENT || phase === PHASE.BOOK_HOVER;
  if (!visible || hintSeen || !onShelf) return null;
  return (
    <div className="toast toast--hint" role="status">
      <span className="toast__dot" aria-hidden="true" />
      Click the glowing book
      <button type="button" className="toast__dismiss" onClick={() => useStore.getState().markHintSeen()} aria-label="Dismiss hint">
        <Icon name="close" />
      </button>
    </div>
  );
};

const StatusToast = () => {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => useStore.setState({ toast: null }), 2400);
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="toast toast--status" role="status">
      {toast}
    </div>
  );
};

const HelpModal = () => {
  const open = useStore((s) => s.help);
  const closeRef = useRef();
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);
  if (!open) return null;
  const close = () => useStore.setState({ help: false });
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={close}>
      <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="modal__close" onClick={close} aria-label="Close help">
          <Icon name="close" />
        </button>
        <p className="modal__kanji" aria-hidden="true">
          右から左へ
        </p>
        <h2 id="help-title" className="modal__title">
          This volume reads right to left
        </h2>
        <p className="modal__lead">Like a printed manga: start with the right-hand page, then read the left one.</p>
        <dl className="help-list">
          <dt>Turn forward</dt>
          <dd>Click the left page, drag its edge to the right, swipe right, or press ←</dd>
          <dt>Turn back</dt>
          <dd>Click the right page or press →</dd>
          <dt>Jump</dt>
          <dd>Choose a chapter in the table of contents</dd>
          <dt>Step back</dt>
          <dd>Esc closes the book, then returns it to the shelf</dd>
          <dt>Keyboard</dt>
          <dd>Tab moves between everything you can open on the visible pages</dd>
        </dl>
        <button type="button" className="text-link" onClick={() => useStore.setState({ help: false, plain: true })}>
          Read the plain version instead
        </button>
      </div>
    </div>
  );
};

const ALL_PROJECTS = portfolio.years.flatMap((year) => year.projects.map((item) => ({ type: "project", item, year: year.label })));

const DetailModal = () => {
  const detail = useStore((s) => s.detail);
  const closeRef = useRef();
  useEffect(() => {
    if (detail) closeRef.current?.focus();
  }, [detail]);
  if (!detail) return null;
  const { item, year } = detail;
  const close = () => useStore.setState({ detail: null });
  const repo = item.repoUrl ?? portfolio.links.github;
  const index = ALL_PROJECTS.findIndex((p) => p.item === item);
  const go = (offset) => {
    const target = ALL_PROJECTS[index + offset];
    if (target) useStore.setState({ detail: target });
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={close}>
      <article
        key={item.title}
        className="modal__panel modal__panel--manga detail"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(1);
          if (e.key === "ArrowRight") go(-1);
        }}
      >
        <span className="detail__lines" aria-hidden="true" />
        <button ref={closeRef} type="button" className="modal__close" onClick={close} aria-label="Close project">
          <Icon name="close" />
        </button>
        <p className="tag">{year}</p>
        <h2 id="detail-title" className="detail__title">
          {item.title}
        </h2>
        {item.note && <p className="bubble">{item.note}</p>}
        {item.description && <p className="detail__body">{item.description}</p>}
        {item.stack?.length > 0 && (
          <ul className="detail__stack" aria-label="Stack">
            {item.stack.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
        {item.images?.length > 0 && (
          <div className="detail__images">
            {item.images.map((src) => (
              <img key={src} src={src} alt={`${item.title} screenshot`} loading="lazy" />
            ))}
          </div>
        )}
        <div className="detail__links">
          <a className="seal-link" href={repo} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">開拓</span>
            {item.repoUrl ? "Open repository" : "Open GitHub"}
          </a>
          {item.liveUrl && (
            <a className="seal-link seal-link--ghost" href={item.liveUrl} target="_blank" rel="noopener noreferrer">
              Open live project
            </a>
          )}
        </div>
        {ALL_PROJECTS.length > 1 && (
          <nav className="detail__browse" aria-label="Other projects">
            <button type="button" className="text-link" onClick={() => go(1)} disabled={index >= ALL_PROJECTS.length - 1}>
              ← Next project
            </button>
            <span className="detail__count">
              {index + 1} / {ALL_PROJECTS.length}
            </span>
            <button type="button" className="text-link" onClick={() => go(-1)} disabled={index <= 0}>
              Previous project →
            </button>
          </nav>
        )}
      </article>
    </div>
  );
};

// Invisible, focusable twins of the printed hit regions. HeroBook moves them
// over the page every frame so the focus ring lands on the right panel.
const HitButtons = () => {
  const phase = useStore((s) => s.phase);
  const spread = useStore((s) => s.spread);
  const hits = useMemo(() => {
    if (phase === PHASE.READING) {
      const s = book.spreads[spread - 1];
      if (!s) return [];
      return [s.right, s.left].flatMap((page) =>
        (book.pages[page]?.blocks ?? [])
          .map((block, index) => ({ block, index }))
          .filter(({ block }) => block.action)
          .map(({ block, index }) => ({ key: `${page}:${index}`, page, rect: block.rect, label: block.label, action: block.action }))
      );
    }
    if (phase === PHASE.BOOK_CLOSE) {
      return BACK_SEALS.map((seal, i) => ({ key: `seal:${i}`, page: -1, rect: null, label: `${seal.label} (opens in a new tab)`, action: { type: "link", href: seal.href } }));
    }
    return [];
  }, [phase, spread]);

  return (
    <div className="hit-layer">
      {hits.map((hit) => (
        <button
          key={hit.key}
          type="button"
          className="hit-region"
          aria-label={hit.label}
          ref={(el) => {
            if (el) return hitElements.set(hit.key, el);
            hitElements.delete(hit.key);
            // a focused button that unmounts (page turned) never fires blur
            if (useStore.getState().focusedHit?.key === hit.key) useStore.setState({ focusedHit: null });
          }}
          onClick={() => activateHit(hit.action)}
          onFocus={() => useStore.setState({ focusedHit: hit.rect ? hit : null })}
          onBlur={() => useStore.setState({ focusedHit: null })}
        />
      ))}
    </div>
  );
};

// Chapter that a spread belongs to: the last contents entry starting at or before it.
const chapterOf = (spread) => [...book.toc].reverse().find((entry) => entry.spread <= spread) ?? book.toc[0];
const CHAPTER_STARTS = new Set(book.toc.map((entry) => entry.pageIndex));

// The book's fore-edge seen from above: one hairline per page, laid out right
// to left like the volume, taller where a chapter starts. A ribbon bookmark
// marks the open spread. Click or drag along it to jump; it is one slider for
// keyboards and screen readers.
const ForeEdge = () => {
  const spread = useStore((s) => s.spread);
  const busy = useStore((s) => s.busy);
  const [preview, setPreview] = useState(null);
  const strip = useRef();
  const count = book.spreadCount;

  const spreadAt = (clientX) => {
    const rect = strip.current.getBoundingClientRect();
    const fromRight = (rect.right - clientX) / rect.width; // reading runs right to left
    return Math.min(count, Math.max(1, Math.floor(fromRight * count) + 1));
  };
  const onPointerDown = (e) => {
    strip.current.setPointerCapture(e.pointerId);
    setPreview(spreadAt(e.clientX));
  };
  const onPointerMove = (e) => {
    if (e.buttons) setPreview(spreadAt(e.clientX));
  };
  const onPointerUp = (e) => {
    const target = spreadAt(e.clientX);
    setPreview(null);
    if (target !== spread) director.jump(target);
  };
  const onKeyDown = (e) => {
    const step = { ArrowLeft: 1, ArrowUp: 1, ArrowRight: -1, ArrowDown: -1, Home: -count, End: count }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation(); // the book's own arrow keys turn single pages
    director.jump(Math.min(count, Math.max(1, spread + step)));
  };

  const shown = preview ?? spread;
  const chapter = chapterOf(shown);
  const s = book.spreads[shown - 1];
  // ribbon sits at the centre of its spread, measured from the right edge
  const ribbonRight = `${((shown - 0.5) / count) * 100}%`;

  return (
    <div className="foredge">
      <div
        ref={strip}
        className={`foredge__strip ${busy ? "is-busy" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="Spread"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={spread}
        aria-valuetext={`Pages ${s.right + 1} and ${s.left + 1}, ${chapter.title}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {book.pages.map((page) => (
          <span
            key={page.index}
            className={`foredge__page ${CHAPTER_STARTS.has(page.index) ? "is-chapter" : ""} ${page.spread === shown ? "is-open" : ""}`}
          />
        ))}
        <span className="foredge__ribbon" style={{ right: ribbonRight }} aria-hidden="true" />
      </div>
      <p className="foredge__caption" aria-hidden="true">
        <span className="foredge__chapter">{chapter.title}</span>
        <span className="foredge__pages">
          {s.right + 1}–{s.left + 1}
        </span>
      </p>
    </div>
  );
};

const PageIndicator = () => {
  const phase = useStore((s) => s.phase);
  const spread = useStore((s) => s.spread);
  const singlePage = useStore((s) => s.singlePage);
  const pageSide = useStore((s) => s.pageSide);
  if (phase !== PHASE.READING && phase !== PHASE.DIRECT_JUMP) return null;
  const s = book.spreads[spread - 1];
  const atEnd = spread >= book.spreadCount && (!singlePage || pageSide === "left");
  const atStart = spread <= 1 && (!singlePage || pageSide === "right");
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="pager__btn" onClick={director.next} aria-label={atEnd ? "Close the book" : "Next page"}>
        <Icon name="left" />
        <span>{atEnd ? "Close" : "Next"}</span>
      </button>
      <ForeEdge />
      <button type="button" className="pager__btn" onClick={director.prev} disabled={atStart} aria-label="Previous page">
        <span>Back</span>
        <Icon name="right" />
      </button>
      <p className="sr-only" aria-live="polite">
        {singlePage ? `Page ${pageSide === "right" ? s.right + 1 : s.left + 1}` : `Pages ${s.right + 1} and ${s.left + 1}`} of {book.pageCount}
      </p>
    </nav>
  );
};

const StagePrompts = () => {
  const phase = useStore((s) => s.phase);
  const busy = useStore((s) => s.busy);
  if (phase === PHASE.COVER_INSPECT && !busy) {
    return (
      <div className="stage-prompt">
        <button type="button" className="cta" onClick={director.open}>
          <span className="cta__kanji" aria-hidden="true">
            開く
          </span>
          Open the volume
        </button>
        <button type="button" className="text-link" onClick={director.escape}>
          Put it back
        </button>
      </div>
    );
  }
  if (phase === PHASE.BOOK_CLOSE && !busy) {
    return (
      <div className="stage-prompt">
        <button type="button" className="cta" onClick={director.returnToShelf}>
          Return to shelf
        </button>
        <button type="button" className="text-link" onClick={director.reopen}>
          Read it again
        </button>
      </div>
    );
  }
  return null;
};

const Chrome = () => {
  const muted = useStore((s) => s.muted);
  const toggleMute = useStore((s) => s.toggleMute);
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return (
    <>
      <header className="brand">
        <span className="brand__title">Developer Chronicles</span>
        <span className="brand__vol">Vol. 01</span>
      </header>
      <div className="controls">
        <button type="button" className="text-link controls__plain" onClick={() => useStore.setState({ plain: true })}>
          Plain version
        </button>
        <button type="button" className="icon-btn" onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Mute sound"} aria-pressed={muted}>
          <Icon name={muted ? "muted" : "sound"} />
        </button>
        <button type="button" className="icon-btn" onClick={fullscreen} aria-label="Toggle fullscreen">
          <Icon name="fullscreen" />
        </button>
        <button type="button" className="icon-btn" onClick={() => useStore.setState({ help: true })} aria-label="How to read this book">
          <Icon name="help" />
        </button>
      </div>
    </>
  );
};

const PhaseAnnouncer = () => {
  const phase = useStore((s) => s.phase);
  const text = {
    SHELF_AMBIENT: "A library shelf. The glowing green volume is the portfolio. Press Enter to take it.",
    COVER_INSPECT: `${portfolio.name}, Developer Chronicles volume 1. Press Enter to open.`,
    READING: "Book open. Left arrow turns forward, right arrow turns back.",
    BOOK_CLOSE: "Back cover. Links to GitHub, LinkedIn, LeetCode and email are available."
  }[phase];
  return (
    <p className="sr-only" aria-live="polite">
      {text ?? ""}
    </p>
  );
};

export function Overlay() {
  const veil = useRef();
  useEffect(() => registerVeil(veil.current), []);
  return (
    <div className="overlay">
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div ref={veil} className="veil" aria-hidden="true" />
      <HitButtons />
      <Chrome />
      <PageIndicator />
      <StagePrompts />
      <HintToast />
      <StatusToast />
      <HelpModal />
      <DetailModal />
      <PhaseAnnouncer />
      <Loader />
    </div>
  );
}

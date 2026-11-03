// Turns the arrays in portfolio.js into a right-to-left manga volume.
//
// Reading order is a flat list of pages. Page 0 sits on the inside of the front
// cover (right side of spread 1); the last page sits on the inside of the back
// cover. Everything in between is printed on leaves: leaf j carries page 2j+1 on
// its front and page 2j+2 on its back. Every chapter opens on a right-hand page,
// so a chapter that ends on a right page gets a wordless interlude page.
//
// Block rects are normalised page coordinates: [x, y, w, h], origin top-left.

export const PAGE_ASPECT = 0.65; // width / height of one page (tankobon ~ 112 x 174 mm)
export const PLANNED_YEARS = 4;

const CAPACITY = {
  certificatesPerPage: 4,
  hackathonsPerPage: 5,
  projectsOnChapterOpening: 2,
  projectsPerContinuation: 3,
  tocRows: 11
};

const YEAR_KANJI = ["一年目", "二年目", "三年目", "四年目", "五年目", "六年目"];
const CHAPTER_KANJI = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

const MARGIN = { top: 0.065, bottom: 0.075, outer: 0.075, inner: 0.1 };
const GAP = 0.018;

const chapterKanji = (n) => `第${CHAPTER_KANJI[n] ?? n}章`;
const pad2 = (n) => String(n).padStart(2, "0");

const contentBox = (side) => {
  const left = side === "right" ? MARGIN.inner : MARGIN.outer;
  const right = side === "right" ? MARGIN.outer : MARGIN.inner;
  return { x: left, y: MARGIN.top, w: 1 - left - right, h: 1 - MARGIN.top - MARGIN.bottom };
};

const chunk = (items, firstSize, restSize = firstSize) => {
  const pages = [items.slice(0, firstSize)];
  for (let i = firstSize; i < items.length; i += restSize) pages.push(items.slice(i, i + restSize));
  return pages;
};

const stackRects = (box, top, count, gap = GAP) => {
  const height = box.h - (top - box.y);
  const each = (height - gap * (count - 1)) / Math.max(count, 1);
  return Array.from({ length: count }, (_, i) => [box.x, top + i * (each + gap), box.w, each]);
};

// ── page builders: each returns { kind, blocks } and is told its side later ──

const tocPage = () => ({ kind: "toc", blocks: [] }); // filled once chapters are known

const prologuePage = (p) => ({
  kind: "prologue",
  build: (box) => {
    const headerH = 0.1;
    const photoH = 0.42;
    const blocks = [
      {
        kind: "header",
        rect: [box.x, box.y, box.w, headerH],
        data: { label: "Prologue", title: "What am I?", jp: "序章" }
      },
      {
        kind: "photoPanel",
        rect: [box.x, box.y + headerH + 0.01, box.w, photoH],
        data: {
          src: p.media?.photos?.prologue,
          focus: [0.55, 0.42],
          bubble: { text: p.tagline, style: "thought", at: [0.2, 0.18], size: 28 },
          sfx: "ゴゴゴ"
        }
      },
      {
        kind: "nameCard",
        rect: [box.x, box.y + headerH + photoH + 0.025, box.w, box.h - headerH - photoH - 0.13],
        data: {
          name: p.name,
          role: p.role,
          college: `${p.college.name} · ${p.college.branch} · ${p.college.year}`
        }
      }
    ];
    if (p.extraRole) {
      blocks.push({
        kind: "badge",
        rect: [box.x, box.y + box.h - 0.095, box.w, 0.085],
        data: { text: p.extraRole }
      });
    }
    return blocks;
  }
});

const certificatePages = (certs) =>
  chunk(certs, CAPACITY.certificatesPerPage).map((group, pageInGroup) => ({
    kind: "certificates",
    build: (box) => {
      const top = box.y + 0.19;
      return [
        {
          kind: "header",
          rect: [box.x, box.y, box.w, 0.17],
          data: {
            label: pageInGroup === 0 ? "Chapter 01" : "Chapter 01 · cont.",
            title: "Certificates",
            jp: "修了証",
            big: pageInGroup === 0
          }
        },
        ...stackRects(box, top, Math.max(group.length, 3)).slice(0, group.length).map((rect, i) => ({
          kind: "certCard",
          rect,
          data: { ...group[i], index: pageInGroup * CAPACITY.certificatesPerPage + i },
          action: { type: "certificate", item: group[i] },
          label: `Certificate: ${group[i].name}${group[i].issuer ? `, ${group[i].issuer}` : ""}`
        }))
      ];
    }
  }));

const hackathonPages = (hacks, photo) =>
  chunk(hacks, CAPACITY.hackathonsPerPage).map((group, pageInGroup) => ({
    kind: "hackathons",
    build: (box) => {
      const showPhoto = pageInGroup === 0 && photo;
      const headerH = 0.13;
      const photoH = showPhoto ? 0.16 : 0;
      const top = box.y + headerH + 0.015 + (showPhoto ? photoH + 0.015 : 0);
      const blocks = [
        {
          kind: "header",
          rect: [box.x, box.y, box.w, headerH],
          data: { label: pageInGroup === 0 ? "Chapter 01" : "Chapter 01 · cont.", title: "Hackathons", jp: "ハッカソン" }
        }
      ];
      if (showPhoto) {
        blocks.push({
          kind: "photoPanel",
          rect: [box.x, box.y + headerH + 0.015, box.w, photoH],
          data: { src: photo, focus: [0.5, 0.42], tone: "hard" }
        });
      }
      stackRects(box, top, Math.max(group.length, 4))
        .slice(0, group.length)
        .forEach((rect, i) =>
          blocks.push({
            kind: "hackCard",
            rect,
            data: { ...group[i], index: pageInGroup * CAPACITY.hackathonsPerPage + i },
            action: { type: "hackathon", item: group[i] },
            label: `Hackathon: ${group[i].name}${group[i].note ? `, ${group[i].note}` : ""}`
          })
        );
      return blocks;
    }
  }));

const yearPages = (year, yearIndex, chapterNumber) => {
  const groups = chunk(year.projects, CAPACITY.projectsOnChapterOpening, CAPACITY.projectsPerContinuation);
  return groups.map((group, pageInGroup) => ({
    kind: pageInGroup === 0 ? "yearOpening" : "yearContinued",
    build: (box) => {
      const opening = pageInGroup === 0;
      const headerH = opening ? box.h * 0.36 : 0.075;
      const blocks = [
        opening
          ? {
              kind: "splash",
              rect: [box.x, box.y, box.w, headerH],
              data: {
                label: `Chapter ${pad2(chapterNumber)}`,
                kanji: chapterKanji(chapterNumber),
                title: year.label,
                jp: YEAR_KANJI[yearIndex] ?? "",
                count: year.projects.length
              }
            }
          : {
              kind: "header",
              rect: [box.x, box.y, box.w, headerH],
              data: { label: `Chapter ${pad2(chapterNumber)} · cont.`, title: year.label, jp: YEAR_KANJI[yearIndex] ?? "", compact: true }
            }
      ];
      const slots = opening ? CAPACITY.projectsOnChapterOpening : CAPACITY.projectsPerContinuation;
      const offset = opening ? 0 : CAPACITY.projectsOnChapterOpening + (pageInGroup - 1) * CAPACITY.projectsPerContinuation;
      stackRects(box, box.y + headerH + GAP, Math.max(group.length, slots))
        .slice(0, group.length)
        .forEach((rect, i) =>
          blocks.push({
            kind: "projectPanel",
            rect,
            data: { ...group[i], year: year.label, number: offset + i + 1, variant: (offset + i + yearIndex) % 4 },
            action: { type: "project", item: group[i], year: year.label },
            label: `Project: ${group[i].title}${group[i].note ? `, ${group[i].note}` : ""}. Open details.`
          })
        );
      return blocks;
    }
  }));
};

const teaserPage = (yearNumber) => ({
  kind: "teaser",
  build: (box) => [
    {
      kind: "teaser",
      rect: [box.x, box.y, box.w, box.h],
      data: { title: `Year ${yearNumber}`, jp: YEAR_KANJI[yearNumber - 1] ?? "", seed: yearNumber }
    }
  ]
});

const interludePage = (seed) => ({
  kind: "interlude",
  build: (box) => [{ kind: "interlude", rect: [box.x, box.y, box.w, box.h], data: { seed } }]
});

const contactPage = (p, chapterNumber) => ({
  kind: "contact",
  build: (box) => {
    const rows = [
      { key: "email", label: "Email", jp: "伝令", value: p.links.email?.replace(/^mailto:/, ""), href: p.links.email },
      { key: "phone", label: "Phone", jp: "電話", value: p.links.phone, href: p.links.phone && `tel:${p.links.phone.replace(/\s+/g, "")}` },
      { key: "github", label: "GitHub", jp: "開拓", value: p.links.github?.replace(/^https?:\/\//, ""), href: p.links.github },
      { key: "leetcode", label: "LeetCode", jp: "挑戦", value: p.links.leetcode?.replace(/^https?:\/\//, ""), href: p.links.leetcode },
      { key: "linkedin", label: "LinkedIn", jp: "接続", value: p.links.linkedin?.replace(/^https?:\/\/(www\.)?/, ""), href: p.links.linkedin }
    ].filter((row) => row.href);
    const headerH = 0.13;
    const photoH = p.media?.photos?.contact ? 0.27 : 0;
    const blocks = [
      {
        kind: "header",
        rect: [box.x, box.y, box.w, headerH],
        data: { label: `Chapter ${pad2(chapterNumber)}`, title: "Contact", jp: "連絡先" }
      }
    ];
    if (photoH) {
      blocks.push({
        kind: "photoPanel",
        rect: [box.x, box.y + headerH + 0.012, box.w, photoH],
        data: { src: p.media.photos.contact, focus: [0.5, 0.32], tone: "soft" }
      });
    }
    stackRects(box, box.y + headerH + 0.024 + photoH, rows.length, 0.012).forEach((rect, i) =>
      blocks.push({
        kind: "contactRow",
        rect,
        data: rows[i],
        action: { type: "link", href: rows[i].href },
        label: `${rows[i].label}: ${rows[i].value}`
      })
    );
    return blocks;
  }
});

const closingPage = (p) => ({
  kind: "closing",
  build: (box) => [
    {
      kind: "closing",
      rect: [box.x, box.y, box.w, box.h],
      data: { src: p.media?.photos?.closing }
    }
  ]
});

// ── assembly ────────────────────────────────────────────────────────────────

export function buildBook(p) {
  const sections = [];
  const chapters = [];
  let chapterNumber = 1;
  let interludeSeed = 1;

  sections.push({ pages: [tocPage(), prologuePage(p)], toc: [{ at: 1, label: "Prologue", title: "What am I?", jp: "序章" }] });

  const foundations = [...certificatePages(p.certificates ?? []), ...hackathonPages(p.hackathons ?? [], p.media?.photos?.foundations)];
  if (foundations.length) {
    const certPageCount = p.certificates?.length ? Math.ceil(p.certificates.length / CAPACITY.certificatesPerPage) : 0;
    const toc = [];
    if (p.certificates?.length) toc.push({ at: 0, label: `Chapter ${pad2(chapterNumber)}`, title: "Certificates", jp: "修了証" });
    if (p.hackathons?.length) toc.push({ at: certPageCount, label: certPageCount ? "" : `Chapter ${pad2(chapterNumber)}`, title: "Hackathons", jp: "ハッカソン" });
    sections.push({ pages: foundations, toc });
    chapterNumber += 1;
  }

  (p.years ?? []).forEach((year, yearIndex) => {
    if (!year.projects?.length) return;
    sections.push({
      pages: yearPages(year, yearIndex, chapterNumber),
      toc: [{ at: 0, label: `Chapter ${pad2(chapterNumber)}`, title: year.label, jp: YEAR_KANJI[yearIndex] ?? "" }]
    });
    chapterNumber += 1;
  });

  const yearsDone = p.years?.length ?? 0;
  const teasers = [];
  for (let y = yearsDone + 1; y <= PLANNED_YEARS; y += 1) teasers.push(teaserPage(y));
  if (teasers.length) sections.push({ pages: teasers, toc: [{ at: 0, label: "Next volume", title: "To be continued", jp: "次巻予告" }] });

  sections.push({
    pages: [contactPage(p, chapterNumber), closingPage(p)],
    toc: [{ at: 0, label: `Chapter ${pad2(chapterNumber)}`, title: "Contact", jp: "連絡先" }]
  });

  // Flatten, padding each section so every chapter opens on a right-hand page.
  const flat = [];
  sections.forEach((section, sectionIndex) => {
    const start = flat.length;
    section.pages.forEach((page) => flat.push(page));
    const isLast = sectionIndex === sections.length - 1;
    if (!isLast && (flat.length - start) % 2 === 1) flat.push(interludePage(interludeSeed++));
    section.toc.forEach((entry) => chapters.push({ ...entry, pageIndex: start + entry.at }));
  });

  const pages = flat.map((page, index) => {
    const side = index % 2 === 0 ? "right" : "left";
    const box = contentBox(side);
    return {
      index,
      number: index + 1,
      side,
      spread: Math.floor(index / 2) + 1,
      kind: page.kind,
      blocks: page.build ? page.build(box) : page.blocks,
      box
    };
  });

  const toc = chapters.map((c) => ({ ...c, spread: Math.floor(c.pageIndex / 2) + 1, pageNumber: c.pageIndex + 1 }));

  // The table of contents is page 0; lay it out now that page numbers exist.
  const tocBox = pages[0].box;
  const headerH = 0.2;
  const rowCount = Math.min(toc.length, CAPACITY.tocRows);
  const rowArea = tocBox.h - headerH - 0.14;
  const rowH = Math.min(0.072, rowArea / Math.max(rowCount, 1));
  pages[0].blocks = [
    { kind: "tocHeader", rect: [tocBox.x, tocBox.y, tocBox.w, headerH], data: { title: "Contents", jp: "目次", label: "Chapter 00" } },
    ...toc.slice(0, rowCount).map((entry, i) => ({
      kind: "tocEntry",
      rect: [tocBox.x, tocBox.y + headerH + 0.02 + i * rowH, tocBox.w, rowH * 0.92],
      data: entry,
      action: { type: "jump", spread: entry.spread },
      label: `${entry.label ? `${entry.label}: ` : ""}${entry.title}, page ${entry.pageNumber}`
    })),
    { kind: "tocFooter", rect: [tocBox.x, tocBox.y + tocBox.h - 0.11, tocBox.w, 0.11], data: { name: p.name } }
  ];

  const spreads = [];
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push({ index: i / 2 + 1, right: i, left: i + 1 });
  }

  return {
    pages,
    spreads,
    toc,
    pageCount: pages.length,
    spreadCount: spreads.length,
    leafCount: (pages.length - 2) / 2
  };
}

// Which page faces are printed where.
export const leafFrontPage = (leafIndex) => 2 * leafIndex + 1;
export const leafBackPage = (leafIndex) => 2 * leafIndex + 2;

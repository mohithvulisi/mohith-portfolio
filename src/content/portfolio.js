// ─────────────────────────────────────────────────────────────────────────────
//  THE ONLY FILE TO EDIT.
//  Add a project, hackathon, certificate or a whole new year below and the book
//  re-paginates itself: table of contents, page count and textures all follow.
//
//  Optional fields you may add to any project / hackathon / certificate:
//    description, stack: [], repoUrl, liveUrl, images: [], certificateUrl
// ─────────────────────────────────────────────────────────────────────────────

export const portfolio = {
  tagline: "What am I?",
  name: "Mohith Sai Vulisi",
  role: "Data Analyst, AI Systems Orchestrator, AI-Native Developer",
  college: { name: "MLRIT", branch: "CSE (DS)", year: "II-I year" },
  extraRole: "A designer in SCYTE",
  links: {
    github: "https://github.com/mohithvulisi", // note: "all projects are repo-ed"
    leetcode: "https://leetcode.com/u/FvZpxu9yqi",
    linkedin: "https://linkedin.com/in/mohith-sai-vulisi-692b3a388",
    email: "mailto:vulisimohithsai@gmail.com",
    phone: "9618874569"
  },
  years: [
    {
      label: "1st year",
      projects: [
        { title: "IRIS-AI", note: "My first AI bot" },
        { title: "Resume Analyser" },
        { title: "Room Sync App", note: "Micro project" },
        { title: "Treeman", note: "Ignitia" }
      ]
    },
    {
      label: "2nd year",
      projects: [
        { title: "Student Performance Dashboard" },
        { title: "Placement Analysis Dashboard" },
        { title: "Score Predictor" },
        { title: "Zoet-Plus" },
        { title: "IoT Tracker" }
      ]
    }
  ],
  hackathons: [
    { name: "Zignasa 2K25", note: "AI automation" },
    { name: "Ignitia Tech Fest", note: "Treeman" },
    { name: "KL University Hackathon" },
    { name: "Workshop Carnival 2.0" },
    { name: "Hack2Hire, Malla Reddy", note: "IoT Tracker" }
  ],
  certificates: [
    { name: "C Essentials", issuer: "Cisco" },
    { name: "Python Essentials", issuer: "Cisco" },
    { name: "Autodesk completion" }
  ],

  // Your own photos and reel. Swap files in /public/assets to change them.
  // Any entry can be removed; the book falls back to procedural ink art.
  media: {
    reel: "/assets/media/reel.mp4",
    photos: {
      prologue: "/assets/photos/pondering.webp",
      portrait: "/assets/photos/portrait.webp",
      foundations: "/assets/photos/pendant.webp",
      contact: "/assets/photos/sunlight.webp",
      closing: "/assets/photos/hyacinth.webp"
    }
  }
};

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
        {
          title: "IRIS-AI",
          note: "My first AI bot",
          description: "Conversational dialogue agent exploring natural language prompts, multi-turn state, and responsive intent routing.",
          stack: ["Python", "NLP", "LLM APIs", "JSON State"],
          repoUrl: "https://github.com/mohithvulisi/IRIS-AI"
        },
        {
          title: "Resume Analyser",
          note: "FastAPI & Llama-3.3",
          description: "Automated candidate fitness evaluator parsing resumes and scoring ATS compatibility against job descriptions.",
          stack: ["FastAPI", "Groq Llama-3.3", "LangChain", "PyPDF"],
          repoUrl: "https://github.com/mohithvulisi/resume-analyzer"
        },
        {
          title: "Room Sync App",
          note: "WebRTC Audio Sync",
          description: "Universal audio streaming platform with sub-100ms sync across devices using WebRTC and P2P chunk transfer.",
          stack: ["WebRTC", "Node.js", "Capacitor", "P2P Audio"],
          repoUrl: "https://github.com/mohithvulisi/room-sync-app"
        },
        {
          title: "Treeman",
          note: "Ignitia Finalist",
          description: "Inclusive job-matching portal for differently-abled talent built with Google Gemini AI and React for Ignitia Tech Fest.",
          stack: ["Google Gemini API", "React", "Node.js", "AI Studio"],
          repoUrl: "https://github.com/mohithvulisi/treeman-ignitia"
        }
      ]
    },
    {
      label: "2nd year",
      projects: [
        {
          title: "Student Performance Dashboard",
          note: "STAR98 Dataset EDA",
          description: "Interactive analytics dashboard diagnosing educational variance and pupil-teacher ratios across 300+ California districts.",
          stack: ["Python", "Pandas", "Plotly", "Streamlit"],
          repoUrl: "https://github.com/mohithvulisi/star98-student-performance-dashboard"
        },
        {
          title: "Placement Analysis Dashboard",
          note: "SQL Query Lab",
          description: "SQL-driven recruitment dashboard analyzing placement rates, department trends, and offer statistics with an interactive query lab.",
          stack: ["Python", "SQL", "Streamlit", "SQLite", "Plotly"],
          repoUrl: "https://github.com/mohithvulisi/placement-analytics-dashboard"
        },
        {
          title: "Score Predictor",
          note: "Deployed ML Web App",
          description: "Multivariate regression model predicting exam outcomes from study hours and attendance metrics with real-time inference.",
          stack: ["Scikit-Learn", "Streamlit", "Pandas", "NumPy"],
          repoUrl: "https://github.com/mohithvulisi/student-score-predictor",
          liveUrl: "https://student-score-predictor-spys6shfzupqxkqducitzs.streamlit.app/"
        },
        {
          title: "Zoet-Plus",
          note: "Streamlit Video Rooms",
          description: "Secure virtual collaboration rooms featuring WebRTC streams, PostgreSQL persistence, and OpenCV focus metrics.",
          stack: ["Streamlit", "WebRTC", "PostgreSQL", "SQLAlchemy", "OpenCV"],
          repoUrl: "https://github.com/mohithvulisi/zoet-plus"
        },
        {
          title: "IoT Tracker",
          note: "LOT Mechanical Showcase",
          description: "Cinematic, frame-by-frame scroll-driven product experience and simulation showcasing an unfolding mechanical location tracker.",
          stack: ["JavaScript", "HTML5 Canvas", "CSS3", "Scroll FX"],
          repoUrl: "https://github.com/mohithvulisi/lot-tracker"
        }
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
      contact: "/assets/photos/suit.webp",
      closing: "/assets/photos/hyacinth.webp"
    }
  }
};

export type RouteId = 'automation' | 'platform' | 'systems' | 'systems-branch'
export type CardId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9'

export interface ProjectCard {
  id: CardId
  title: string
  blurb: string
  stack: string[]
  repos: string[]
  public: boolean
  url?: string
  route: RouteId
}

export const routeNames: Record<RouteId, string> = {
  automation: 'Automation Pass',
  platform: 'Platform Ridge',
  systems: 'Systems Drop',
  'systems-branch': 'Cluster Yard',
}

// Private-card copy is CV-level only (spec §7). Pending user approval before launch.
export const projects: ProjectCard[] = [
  {
    id: 'C1', route: 'platform', public: false,
    title: 'Akademiya-AI platform',
    blurb: 'Learning platform for Class A Education: a Python API, a React Native mobile app and a TypeScript web app, built with a small team.',
    stack: ['Python', 'TypeScript', 'React Native', 'Kotlin'],
    repos: ['Akademiya-AI/Akademiya-AI-Backend', 'Akademiya-AI/Akademiya-AI-Mobile', 'Akademiya-AI/Akademiya-AI-Frontend'],
  },
  {
    id: 'C9', route: 'platform', public: false,
    title: 'Akademiya Math',
    blurb: 'Offline Math and SAT learning app for Android and the web, with homework, adaptive practice, topic games and guided coaching.',
    stack: ['Dart', 'Flutter', 'Go'],
    repos: ['molotovgit/akademiya-math-app'],
  },
  {
    id: 'C2', route: 'platform', public: false,
    title: 'Class A Recruiting Hub',
    blurb: 'CRM and admin platform for a recruiting company: lead pipeline, candidate tracking and hourly encrypted backups, self-hosted on a VPS.',
    stack: ['JavaScript', 'TypeScript', 'Docker', 'PostgreSQL'],
    repos: ['s1gmamale1/Class-A-Recruiting-Hub'],
  },
  {
    id: 'C3', route: 'automation', public: false,
    title: 'NETS generation machine',
    blurb: 'Textbook-to-video pipeline. A head node splits chapters into jobs for a fleet of worker PCs and tracks them on a live dashboard.',
    stack: ['Python', 'TypeScript', 'PowerShell'],
    repos: ['molotovgit/nets-generation-machine'],
  },
  {
    id: 'C8', route: 'automation', public: true,
    title: 'Content automation v5 → v7',
    blurb: 'Notion → ChatGPT → Gemini → Notion image pipeline, iterated from batch mode to multi-account rotation and humanlike input.',
    stack: ['JavaScript', 'Python', 'Puppeteer'],
    repos: ['molotovgit/cca-v5', 'molotovgit/cca-v6', 'molotovgit/cca-v6.2', 'molotovgit/cca-v7'],
    url: 'https://github.com/molotovgit/cca-v6.2',
  },
  {
    id: 'C4', route: 'systems', public: true,
    title: 'C&C Generals Zero Hour on Android',
    blurb: 'Arm64 Android port of a 2003 RTS on the GeneralsX engine, via SDL3 and DXVK (D3D8 → Vulkan) on Mali GPUs, with touch controls.',
    stack: ['C++', 'SDL3', 'Vulkan', 'Android'],
    repos: ['molotovgit/CnC-Generals-ZeroHour-Android'],
    url: 'https://github.com/molotovgit/CnC-Generals-ZeroHour-Android',
  },
  {
    id: 'C5', route: 'systems', public: true,
    title: 'allowgram',
    blurb: 'Telegram Desktop-derived Windows client with explicit conversation allow-lists and Mini Apps for allowed bots.',
    stack: ['C++', 'Qt', 'CMake'],
    repos: ['molotovgit/allowgram'],
    url: 'https://github.com/molotovgit/allowgram',
  },
  {
    id: 'C6', route: 'systems-branch', public: true,
    title: '30-node Windows cluster',
    blurb: 'Unattended setup for a cluster of Hyper-V hosts with two VMs each, all driven from one MeshCentral controller.',
    stack: ['PowerShell', 'Hyper-V', 'MeshCentral'],
    repos: ['molotovgit/windows-cluster-host', 'molotovgit/windows-cluster-controller'],
    url: 'https://github.com/molotovgit/windows-cluster-controller',
  },
  {
    id: 'C7', route: 'systems-branch', public: false,
    title: 'Agent rigs',
    blurb: 'SigmaLink, an Electron workspace that runs five coding agents in isolated Git worktrees, plus a Telegram-driven autonomous Claude Code bot.',
    stack: ['TypeScript', 'Electron', 'Docker'],
    repos: ['s1gmamale1/SigmaLink', 'molotovgit/claude-code-telegram-bot', 'molotovgit/hermes-backup'],
  },
]

export const about = {
  name: 'Amirbek',
  handle: 'molotovgit',
  line: 'Mostly systems work — an Android port of a 2003 RTS, education platform backends, and a few automation rigs.',
  skills: [
    { name: 'Python', level: 1.0 },
    { name: 'TypeScript', level: 0.9 },
    { name: 'C++', level: 0.6 },
    { name: 'PowerShell', level: 0.5 },
    { name: 'Kotlin', level: 0.35 },
    { name: 'Dart', level: 0.3 },
  ],
  links: [{ label: 'GitHub', url: 'https://github.com/molotovgit' }],
}

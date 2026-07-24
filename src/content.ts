export type ContentKind = "blog" | "guide";
export type ContentStatus = "draft" | "published";

export interface ContentFaq {
  question: string;
  answer: string;
}

export interface ContentSource {
  label: string;
  url: string;
  note: string;
}

export interface ContentDocument {
  kind: ContentKind;
  slug: string;
  path: string;
  status: ContentStatus;
  title: string;
  description: string;
  h1: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  ogImage: string;
  readTime: string;
  faqs: ContentFaq[];
  sources: ContentSource[];
}

export interface PromptExample {
  id: string;
  category: "Poster & Flyer" | "UI & App Mockup" | "Infographic & Data Visualization" | "Storyboard & Scene" | "Product Photography";
  title: string;
  useCase: string;
  prompt: string;
  aspectRatio: "1:1" | "3:2" | "16:9" | "4:3" | "9:16";
  check: string;
  tested: false;
  testRecord: {
    status: "not-run";
    testedAt: null;
    entryPoint: null;
    result: null;
    editorialNote: string;
  };
}

export const QWEN_IMAGE_3_RELEASE_URL = "https://qwen.ai/blog?id=qwen-image-3.0";
export const QWEN_IMAGE_3_API_URL = "https://www.alibabacloud.com/help/tc/model-studio/qwen-image-generation-and-editing-api-reference";
export const QWEN_CHAT_URL = "https://chat.qwen.ai/";
export const MIDJOURNEY_PROMPT_URL = "https://docs.midjourney.com/hc/en-us/articles/32023408776205-Prompt-Basics";
export const MIDJOURNEY_TEXT_URL = "https://docs.midjourney.com/hc/en-us/articles/32502277092109-Text-Generation";
export const MIDJOURNEY_PRICING_URL = "https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans";
export const MIDJOURNEY_VERSION_URL = "https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version";
export const MIDJOURNEY_GUIDELINES_URL = "https://docs.midjourney.com/hc/en-us/articles/32013696484109-Community-Guidelines";

const qwenSources: ContentSource[] = [
  {
    label: "Qwen-Image-3.0 official release",
    url: QWEN_IMAGE_3_RELEASE_URL,
    note: "Primary source for the 4.5k-token, approximately 10px text, 12-language, dense-layout, interface, and editing demonstrations.",
  },
  {
    label: "Alibaba Cloud Model Studio API reference",
    url: QWEN_IMAGE_3_API_URL,
    note: "Primary source for the qwen-image-3.0-pro model ID, invite-only access, text-to-image, and one-to-three-reference-image editing contract.",
  },
];

export const contentDocuments: ContentDocument[] = [
  {
    kind: "blog",
    slug: "qwen-image-3-vs-midjourney",
    path: "/blog/qwen-image-3-vs-midjourney",
    status: "published",
    title: "Qwen Image 3 vs Midjourney: Which AI Image Generator Wins in 2026?",
    description: "Compare Qwen Image 3 and Midjourney side by side — text accuracy, dense layouts, multilingual rendering, pricing, and real-world use cases. See which fits your workflow.",
    h1: "Qwen Image 3 vs Midjourney — Full Comparison 2026",
    excerpt: "A source-led comparison of long prompts, on-image text, multilingual layouts, editing, access, pricing, and the workflows each product is documented to support.",
    publishedAt: "2026-07-25",
    updatedAt: "2026-07-25",
    author: "Qwen Image 3 Generator Hub",
    ogImage: "/qwen-image-3-vs-midjourney-og.png",
    readTime: "12 min",
    faqs: [
      {
        question: "Can Qwen Image 3 replace Midjourney?",
        answer: "Not for every workflow. Qwen's official release emphasizes information-dense layouts, long structured instructions, multilingual text, and practical interfaces. Midjourney documents a mature creative workflow built around concise prompts, style controls, personalization, references, and iterative editing. Choose according to the work you need to produce, and treat this first edition as a documentation comparison rather than a head-to-head image benchmark.",
      },
      {
        question: "Is Qwen Image 3 free?",
        answer: "The official Qwen release points readers to Qwen Chat, while Alibaba Cloud documents qwen-image-3.0-pro as an invite-only API. Access terms and pricing depend on the official surface. This independent site does not currently provide Qwen Image 3, so its welcome credits and plans must not be read as Qwen Image 3 pricing.",
      },
      {
        question: "Which is better for UI mockups?",
        answer: "Qwen Image 3 is the more directly documented fit for dense, nested, and text-heavy interface scenes. Its official release demonstrates layered web, chat, and livestream-style interfaces. Midjourney can create interface concepts, but its documentation is centered more on visual prompting and creative controls than on long specification-like UI briefs.",
      },
      {
        question: "Which is better for artistic or creative images?",
        answer: "Midjourney offers extensive documented controls for styles, references, personalization, moodboards, variations, and unusual visual treatments. Qwen also demonstrates more than 100 artistic styles, but this site has not independently benchmarked the two systems for artistic quality. For creative exploration, compare actual outputs from your own prompts before committing to one workflow.",
      },
    ],
    sources: [
      ...qwenSources,
      {
        label: "Midjourney Prompt Basics",
        url: MIDJOURNEY_PROMPT_URL,
        note: "Primary source for Midjourney's concise-prompt guidance and advanced prompt structure.",
      },
      {
        label: "Midjourney Text Generation",
        url: MIDJOURNEY_TEXT_URL,
        note: "Primary source for quoted text, short-phrase, and standard Latin alphabet guidance.",
      },
      {
        label: "Midjourney plan comparison",
        url: MIDJOURNEY_PRICING_URL,
        note: "Primary source for current subscription prices, Fast and Relax time, Stealth Mode, and plan differences.",
      },
      {
        label: "Midjourney Community Guidelines",
        url: MIDJOURNEY_GUIDELINES_URL,
        note: "Primary source for Midjourney's restrictions on unauthorized automation and general API availability.",
      },
      {
        label: "Midjourney version documentation",
        url: MIDJOURNEY_VERSION_URL,
        note: "Primary source for V8.1 default status, release timing, native 2K HD images, and version compatibility.",
      },
    ],
  },
  {
    kind: "guide",
    slug: "how-to-generate-ai-images-with-qwen-image-3",
    path: "/guides/how-to-generate-ai-images-with-qwen-image-3",
    status: "published",
    title: "How to Generate AI Images with Qwen Image 3 — Complete Guide",
    description: "Step-by-step guide to generating AI images with Qwen Image 3. Learn prompt writing, aspect ratio selection, model settings, and pro tips for best results.",
    h1: "How to Generate AI Images with Qwen Image 3 — Step-by-Step Guide",
    excerpt: "A practical workflow for choosing an official access path, writing structured briefs, selecting output dimensions, reviewing text, and iterating safely.",
    publishedAt: "2026-07-25",
    updatedAt: "2026-07-25",
    author: "Qwen Image 3 Generator Hub",
    ogImage: "/how-to-generate-with-qwen-image-3-og.png",
    readTime: "11 min",
    faqs: [
      {
        question: "Where can I access Qwen Image 3?",
        answer: "The Qwen team's official release links to Qwen Chat. Alibaba Cloud also documents qwen-image-3.0-pro for text-to-image and image editing, but currently describes that API as invite-only. This independent site has not connected Qwen Image 3.",
      },
      {
        question: "How long can a Qwen Image 3 prompt be?",
        answer: "Qwen's official release says the model accepts instructions up to about 4.5k tokens. Long prompts work best when they are organized into sections for canvas, hierarchy, exact text, panels, visual style, and verification requirements.",
      },
      {
        question: "Can Qwen Image 3 edit an existing image?",
        answer: "Yes, according to the official release and Alibaba Cloud API reference. The documented qwen-image-3.0-pro interface accepts one to three reference images with editing instructions. That editing contract is not implemented in this site's current generator.",
      },
      {
        question: "What should I check after generation?",
        answer: "Review every required word, number, formula, label, panel boundary, visual hierarchy, and factual detail. Official demonstrations show strong text and layout ability, but generated images still require human review before publication or production use.",
      },
    ],
    sources: qwenSources,
  },
  {
    kind: "guide",
    slug: "best-prompts-for-qwen-image-3",
    path: "/guides/best-prompts-for-qwen-image-3",
    status: "published",
    title: "50+ Best Prompts for Qwen Image 3 — Curated Examples",
    description: "50+ curated prompts for Qwen Image 3, organized for posters, UI mockups, infographics, storyboards, and product photos. Copy and adapt each template.",
    h1: "Best Prompts for Qwen Image 3 — 50+ Curated Examples",
    excerpt: "Fifty original prompt templates organized around the dense-layout, text, interface, scene, and detail capabilities documented by the Qwen team.",
    publishedAt: "2026-07-25",
    updatedAt: "2026-07-25",
    author: "Qwen Image 3 Generator Hub",
    ogImage: "/best-prompts-for-qwen-image-3-og.png",
    readTime: "18 min",
    faqs: [
      {
        question: "Are these Qwen Image 3 prompts tested?",
        answer: "No. This edition is curated from the capabilities and examples documented by the Qwen team, but the prompts have not completed a 50-result Qwen Image 3 benchmark. They are labeled curated rather than tested until prompt-level evidence is recorded.",
      },
      {
        question: "What is the best structure for a Qwen Image 3 prompt?",
        answer: "Start with the output type and canvas, then describe hierarchy, subject, exact text, layout regions, visual style, lighting, colors, and final checks. For complex work, use labeled sections instead of one long paragraph.",
      },
      {
        question: "How should I request exact text?",
        answer: "Place every required string in quotation marks, identify its language, specify where it belongs, and state its relative size and priority. Keep critical copy separate from decorative instructions and verify spelling after generation.",
      },
      {
        question: "Why do some prompts only offer a Copy button?",
        answer: "This site's current generator accepts prompts up to the limit shown for its available model and does not run Qwen Image 3. Templates that exceed the current 800-character handoff limit can still be copied for use in an official Qwen Image 3 surface.",
      },
    ],
    sources: qwenSources,
  },
  {
    kind: "guide",
    slug: "qwen-image-3-tutorial",
    path: "/guides/qwen-image-3-tutorial",
    status: "published",
    title: "Qwen Image 3 Tutorial: Complete Guide for 2026",
    description: "Learn Qwen Image 3 from start to finish — capabilities, access, structured prompts, dense layouts, multilingual text, image editing, and practical workflows.",
    h1: "Qwen Image 3 Tutorial — Complete Guide 2026",
    excerpt: "A source-led introduction to Qwen Image 3 capabilities, official access, prompt structure, editing, productive use cases, and the checks every result still needs.",
    publishedAt: "2026-07-25",
    updatedAt: "2026-07-25",
    author: "Qwen Image 3 Generator Hub",
    ogImage: "/qwen-image-3-tutorial-og.png",
    readTime: "14 min",
    faqs: [
      {
        question: "What is Qwen Image 3?",
        answer: "Qwen-Image-3.0 is the third-generation foundational image model announced by the Qwen team on July 21, 2026. Its release focuses on rich content, authentic details, and deep knowledge for information-dense and practical visual work.",
      },
      {
        question: "Is Qwen Image 3 available on this site?",
        answer: "No. The official model now exists, but this independent site currently exposes the available model shown in its generator and has not implemented or externally accepted a Qwen Image 3 provider adapter.",
      },
      {
        question: "What are Qwen Image 3's headline capabilities?",
        answer: "The official release describes prompts up to about 4.5k tokens, text rendered at approximately 10px, native rendering across 12 languages, more than 100 artistic styles, dense multi-panel layouts, nested interfaces, and image editing.",
      },
      {
        question: "Does an official demo guarantee perfect results?",
        answer: "No. Official examples establish intended capabilities, not a guarantee for every prompt. This site has not independently benchmarked Qwen Image 3, so users should verify text, facts, formulas, composition, and editing fidelity in every output.",
      },
    ],
    sources: qwenSources,
  },
];

export const publishedContentDocuments = contentDocuments.filter((document) => document.status === "published");

export const homeFaqs: Array<{ id: string; question: string; answer: string }> = [
  { id: "account-access", question: "Can I generate without signing in?", answer: "No. Image generation requires an account so every request is charged against a server-authoritative credit balance." },
  { id: "starter-credits", question: "Do new accounts receive starter credits?", answer: "Yes. A new account receives 20 welcome credits once—enough for five Standard images. Generation requires signing in." },
  { id: "credits", question: "How do credits work?", answer: "Standard costs 4 credits, High costs 8, and Ultra costs 16. Credits are reserved first and settled only after a successful result." },
  { id: "failed-generations", question: "Are failed generations charged?", answer: "No. A system or provider failure releases the reservation automatically and restores the account credits." },
  { id: "priority", question: "Do paid generations run faster?", answer: "Creator and Professional subscribers enter the VIP priority lane. Starter subscribers use the standard account queue while keeping private, watermark-free exports." },
  { id: "privacy", question: "Are my images public?", answer: "No. Generations are private by default. Nothing is published without a separate explicit action." },
  { id: "analytics", question: "Do you use analytics?", answer: "Yes. GA4 measures page visits when the site loads. Advertising storage and personalization are disabled, and prompts, generated images, and account identifiers are not sent." },
  { id: "model-availability", question: "Is Qwen Image 3 available in this generator?", answer: "No. Qwen officially announced Qwen-Image-3.0 on July 21, 2026, but no Qwen Image 3 provider is connected here. The generator and Models page identify the exact currently available runtime." },
  { id: "billing-refunds", question: "What happens after a refund or dispute?", answer: "Credit spending is paused for billing review, the financial event is shown in billing history, and no silent balance mutation is performed." },
  { id: "account-deletion", question: "What does account deletion remove?", answer: "Any Stripe subscription and customer are removed first, then local assets, projects, credits, sessions, keys, and connected identities are deleted." },
  { id: "api-audit", question: "Can I audit API use?", answer: "Yes. Scoped API keys and recent request status, latency, and request IDs are available inside Studio." },
  { id: "independent-product", question: "Is this an official Qwen product?", answer: "No. This is an independent third-party product and is not affiliated with or endorsed by Alibaba or the Qwen team." },
  { id: "official-announcement", question: "What did Qwen officially announce for Qwen Image 3?", answer: "The Qwen team announced Qwen-Image-3.0 as a model for rich content, authentic details, and deep knowledge. Official demonstrations cover dense layouts, small text, multilingual rendering, complex interfaces, and editing. Those model demonstrations are not claims that this site has integrated it." },
  { id: "official-prompt-length", question: "How long can a Qwen Image 3 prompt be?", answer: "Qwen's official release describes instruction input up to about 4.5k tokens. This site's current available runtime has its own shorter limit, shown beside the generator, because Qwen Image 3 is not connected here." },
  { id: "official-editing-languages", question: "Does Qwen Image 3 support image editing and multilingual text?", answer: "According to Qwen and Alibaba Cloud, the official model supports image editing and native rendering across 12 languages. Alibaba Cloud currently documents qwen-image-3.0-pro as invite-only. Neither capability is exposed by this site's current generator." },
];

const promptTemplates: Array<Omit<PromptExample, "testRecord">> = [
  {
    id: "poster-01",
    category: "Poster & Flyer",
    title: "Bilingual Design Conference Poster",
    useCase: "A structured event poster with English and Chinese hierarchy.",
    prompt: "Create a vertical design conference poster, 3:4 ratio. Header: \"FORM / FUNCTION 2026\" in bold condensed type. Add Chinese subtitle \"设计与功能论坛\" below it. Center: an abstract folded-paper sculpture in cobalt, ivory, and orange. Footer grid: \"Shanghai · 18 September · 09:30\" plus three speaker names. Keep every line readable, align all text to a strict twelve-column editorial grid, and leave generous margins.",
    aspectRatio: "3:2",
    check: "Verify both languages, the date, speaker line, and grid alignment.",
    tested: false,
  },
  {
    id: "poster-02",
    category: "Poster & Flyer",
    title: "Independent Film Festival",
    useCase: "A cinematic festival identity with a compact program.",
    prompt: "Design a portrait independent film festival poster titled \"AFTER THE RAIN\". Show a quiet night bus reflected in wet pavement, deep blue shadows, one amber streetlight, subtle 35mm grain. Add the exact lines \"12–16 OCTOBER 2026\", \"SCREEN 04\", and \"Stories that stay after the credits\". Use a restrained Swiss grid and keep the film title dominant.",
    aspectRatio: "9:16",
    check: "Check title spelling, dates, screen number, and cinematic tonal separation.",
    tested: false,
  },
  {
    id: "poster-03",
    category: "Poster & Flyer",
    title: "Museum Exhibition Flyer",
    useCase: "An art exhibition flyer with object captions.",
    prompt: "Create a museum exhibition flyer for \"THE WEIGHT OF LIGHT\". Feature three translucent glass objects on dark stone, photographed with precise gallery lighting. Add a small caption under each object: \"Vessel I\", \"Vessel II\", \"Vessel III\". Footer text: \"North Hall · Free Entry · 10:00–18:00\". Use elegant serif headlines, neutral sans-serif details, and a quiet cream-and-charcoal palette.",
    aspectRatio: "3:2",
    check: "Confirm the three distinct captions and opening hours.",
    tested: false,
  },
  {
    id: "poster-04",
    category: "Poster & Flyer",
    title: "Community Night Market",
    useCase: "A friendly multilingual neighborhood event poster.",
    prompt: "Make a lively night market poster titled \"RIVER LANE NIGHT MARKET\" with the Chinese line \"河畔夜市\". Illustrate lanterns, food stalls, bicycles, and families beside a river. Add \"Friday 17:00–22:00\", \"Local food · Music · Makers\", and \"Entry free\". Use warm red, apricot, teal, and black with hand-cut paper textures. Keep the schedule easy to scan.",
    aspectRatio: "3:2",
    check: "Verify bilingual title, time range, and the three activity labels.",
    tested: false,
  },
  {
    id: "poster-05",
    category: "Poster & Flyer",
    title: "Jazz Quartet Announcement",
    useCase: "A typographic music poster.",
    prompt: "Design a 4:3 jazz concert poster for \"THE MIDNIGHT QUARTET\". Build the composition from four oversized geometric instrument silhouettes: saxophone, piano keys, upright bass, drums. Add \"Live at Meridian Room\", \"Saturday · 20:30\", and \"Doors 19:45\". Use black, bone white, and electric lime. Keep typography crisp and avoid decorative filler text.",
    aspectRatio: "4:3",
    check: "Check venue, performance time, door time, and four instruments.",
    tested: false,
  },
  {
    id: "poster-06",
    category: "Poster & Flyer",
    title: "Climate Lecture Series",
    useCase: "An educational lecture poster with data accents.",
    prompt: "Create a clean academic poster titled \"CLIMATE SIGNALS\". Subtitle: \"Reading a Changing Coastline\". Show a cutaway coastal diagram with sea level markers, dunes, wetlands, and a small research station. Include \"Lecture 03\", \"Dr. Maya Chen\", \"Auditorium B\", and \"27 August · 18:00\". Use ocean blue, sand, and warning orange with precise scientific labels.",
    aspectRatio: "3:2",
    check: "Verify speaker, venue, date, time, and scientific label placement.",
    tested: false,
  },
  {
    id: "poster-07",
    category: "Poster & Flyer",
    title: "Coffee Roastery Launch",
    useCase: "A premium retail launch flyer.",
    prompt: "Design a square launch flyer for \"NORTHLINE ROASTERY\". Photograph a matte black coffee bag, a ceramic cup, and scattered beans on warm travertine. Add \"Opening Week\", \"Single-origin tasting\", \"08:00–17:00\", and \"42 Northline Street\". Use refined editorial product photography, soft morning shadows, and minimal copper typography.",
    aspectRatio: "1:1",
    check: "Confirm brand, hours, address, and product separation.",
    tested: false,
  },
  {
    id: "poster-08",
    category: "Poster & Flyer",
    title: "Japanese Book Fair",
    useCase: "A Japanese and English cultural event flyer.",
    prompt: "Create a vertical book fair poster with the Japanese title \"本と街の小さな祭り\" and the English subtitle \"A Small Festival of Books and City Life\". Illustrate stacked books forming a compact city street with readers in windows. Add \"5–7 November\", \"East Library\", and \"Talks · Stalls · Workshops\". Use indigo, vermilion, paper white, and visible print texture.",
    aspectRatio: "9:16",
    check: "Verify Japanese title, English subtitle, dates, venue, and activities.",
    tested: false,
  },
  {
    id: "poster-09",
    category: "Poster & Flyer",
    title: "Architecture Open House",
    useCase: "A modern architecture event poster.",
    prompt: "Design a minimalist architecture open-house poster titled \"OPEN STRUCTURES\". Show an axonometric concrete pavilion with labeled zones \"COURT\", \"GALLERY\", \"WORKSHOP\", and \"GARDEN\". Add \"Sunday 13 September\", \"10:00–16:00\", and \"Guided tours every hour\". Use graphite linework, pale gray fields, and one amber accent.",
    aspectRatio: "3:2",
    check: "Check all four zone labels, date, hours, and tour note.",
    tested: false,
  },
  {
    id: "poster-10",
    category: "Poster & Flyer",
    title: "Food Rescue Campaign",
    useCase: "A public-information campaign poster.",
    prompt: "Create a bold public campaign poster titled \"GOOD FOOD, NOT WASTE\". Show a top-down table divided into three labeled zones: \"PLAN\", \"STORE\", \"SHARE\". Add simple food illustrations and one actionable sentence under each heading. Footer: \"Small choices. Full plates. Less waste.\" Use high-contrast green, tomato red, cream, and black with accessible typography.",
    aspectRatio: "3:2",
    check: "Verify the three action headings and keep each instruction legible.",
    tested: false,
  },
  {
    id: "ui-01",
    category: "UI & App Mockup",
    title: "SaaS Analytics Dashboard",
    useCase: "A dense desktop dashboard with realistic labels.",
    prompt: "Create a 16:9 desktop SaaS analytics dashboard for \"Northstar Metrics\". Left navigation: Overview, Revenue, Customers, Retention, Reports. Top cards: Monthly revenue \"$284,300\", Active accounts \"8,412\", Churn \"2.8%\". Main area: twelve-month revenue chart, cohort retention heatmap, and recent alerts table. Use a graphite interface, amber accent, clear hierarchy, and readable compact labels.",
    aspectRatio: "16:9",
    check: "Check navigation labels, three KPI values, chart axes, and table hierarchy.",
    tested: false,
  },
  {
    id: "ui-02",
    category: "UI & App Mockup",
    title: "Mobile Banking Overview",
    useCase: "A polished finance app screen.",
    prompt: "Design a portrait mobile banking app screen titled \"Overview\". Show available balance \"$12,480.32\", two account cards, a seven-day spending chart, and recent transactions: Metro Market −$48.20, Northline Coffee −$6.80, Salary +$4,200. Bottom tabs: Home, Payments, Cards, Profile. Use calm navy, mint, and off-white with accessible touch targets.",
    aspectRatio: "9:16",
    check: "Verify balance, signed transaction amounts, and four bottom tabs.",
    tested: false,
  },
  {
    id: "ui-03",
    category: "UI & App Mockup",
    title: "Project Management Board",
    useCase: "A kanban workspace with nested task detail.",
    prompt: "Create a 16:9 project management interface for \"Atlas Launch\". Show columns \"BACKLOG\", \"IN PROGRESS\", \"REVIEW\", and \"DONE\" with three cards each. Open a task detail panel titled \"Finalize onboarding copy\" with assignee Maya, due date Aug 28, checklist 3/5, and two comments. Use neutral surfaces, cobalt status tags, and precise compact typography.",
    aspectRatio: "16:9",
    check: "Check four column labels and every task-detail field.",
    tested: false,
  },
  {
    id: "ui-04",
    category: "UI & App Mockup",
    title: "Travel Planning App",
    useCase: "An itinerary interface with map and schedule.",
    prompt: "Design a responsive travel planner for \"Kyoto · 4 Days\". Left panel: day tabs and itinerary cards. Main panel: a map with numbered stops. Day 2 schedule: 08:30 Nishiki Market, 11:00 Kyoto Museum, 14:30 Philosopher's Path, 18:00 Gion dinner. Add weather \"27°C · Light rain\" and a \"Save offline\" action. Use warm paper tones and map-red accents.",
    aspectRatio: "16:9",
    check: "Verify all four times, place names, weather, and offline action.",
    tested: false,
  },
  {
    id: "ui-05",
    category: "UI & App Mockup",
    title: "E-commerce Product Page",
    useCase: "A premium storefront product detail view.",
    prompt: "Create a desktop product page for \"Arc One Desk Lamp\". Include a large product image, thumbnails, price \"$189\", color options Sand, Graphite, Cobalt, quantity selector, \"Add to cart\", delivery estimate \"Ships in 2–3 days\", and accordion rows for Materials, Dimensions, Care. Use refined editorial spacing and a warm neutral palette.",
    aspectRatio: "16:9",
    check: "Check product name, price, colors, delivery estimate, and accordion labels.",
    tested: false,
  },
  {
    id: "ui-06",
    category: "UI & App Mockup",
    title: "Health Appointment Portal",
    useCase: "A clear scheduling interface without medical diagnosis.",
    prompt: "Design a desktop appointment portal titled \"Your care schedule\". Show next visit: \"Dr. Lena Ortiz · General Practice · 29 July · 10:20\". Add cards for Book appointment, Messages, Documents, and Prescriptions. Include a weekly calendar with available slots and a privacy notice: \"Your health information stays private.\" Use white, teal, slate, and accessible contrast.",
    aspectRatio: "16:9",
    check: "Verify clinician, specialty, date, time, navigation cards, and privacy copy.",
    tested: false,
  },
  {
    id: "ui-07",
    category: "UI & App Mockup",
    title: "Music Production Workspace",
    useCase: "A nested creative tool interface.",
    prompt: "Create a widescreen music production interface for a track titled \"Night Transit\". Show eight labeled tracks, a timeline from 00:00 to 03:42, mixer channels, waveform clips, tempo \"118 BPM\", key \"D minor\", and an open effect panel named \"Granular Delay\". Use charcoal panels, violet waveforms, mint meters, and small but readable controls.",
    aspectRatio: "16:9",
    check: "Check track title, duration, tempo, key, effect name, and panel nesting.",
    tested: false,
  },
  {
    id: "ui-08",
    category: "UI & App Mockup",
    title: "Language Learning Lesson",
    useCase: "A bilingual mobile lesson screen.",
    prompt: "Design a mobile language lesson screen titled \"Ordering at a café\". Show a progress bar at 60%, the Japanese phrase \"コーヒーを一つお願いします\", romanization \"Kōhī o hitotsu onegaishimasu\", English meaning \"One coffee, please\", a play-audio button, and three answer choices. Bottom action: \"Check answer\". Use friendly coral and navy with generous spacing.",
    aspectRatio: "9:16",
    check: "Verify Japanese, romanization, translation, progress, and action label.",
    tested: false,
  },
  {
    id: "ui-09",
    category: "UI & App Mockup",
    title: "Live Commerce Interface",
    useCase: "A picture-in-picture livestream shopping scene.",
    prompt: "Create a 16:9 livestream shopping interface. Main video: a presenter demonstrating a compact espresso machine. Picture-in-picture: close-up of the pressure gauge. Product card: \"Miro Mini Espresso\", \"$249\", rating 4.8, \"Add to cart\". Right chat includes four short messages. Top status: \"LIVE · 12.4K watching\". Keep every layer distinct and readable.",
    aspectRatio: "16:9",
    check: "Check product card, viewer count, price, rating, chat, and picture-in-picture hierarchy.",
    tested: false,
  },
  {
    id: "ui-10",
    category: "UI & App Mockup",
    title: "Developer Documentation Portal",
    useCase: "A technical docs interface with code and navigation.",
    prompt: "Design a developer documentation page titled \"Create a Generation\". Left navigation: Introduction, Authentication, Generations, Webhooks, Errors. Main column: POST /v1/generations, parameter table for model, prompt, aspect_ratio, quality, and a JSON request example. Right column: On this page with four anchors. Use a dark code theme, off-white reading surface, and amber highlights.",
    aspectRatio: "16:9",
    check: "Verify endpoint, five parameters, navigation, and code block structure.",
    tested: false,
  },
  {
    id: "info-01",
    category: "Infographic & Data Visualization",
    title: "Urban Water Cycle",
    useCase: "An educational process infographic.",
    prompt: "Create a landscape infographic titled \"HOW A CITY REUSES WATER\". Show a six-step left-to-right flow: Collection, Screening, Biological treatment, Filtration, Disinfection, Reuse. Add one concise sentence and a numbered icon for each step. Include a small city cross-section connecting homes, treatment plant, park irrigation, and river. Use blue, teal, sand, and charcoal.",
    aspectRatio: "16:9",
    check: "Verify all six steps, order, arrows, and city connections.",
    tested: false,
  },
  {
    id: "info-02",
    category: "Infographic & Data Visualization",
    title: "Remote Team Time Zones",
    useCase: "A global scheduling visualization.",
    prompt: "Design an infographic titled \"ONE TEAM, FIVE TIME ZONES\". Include horizontal 24-hour bands for San Francisco, New York, London, Berlin, and Singapore. Highlight the shared meeting window 15:00–17:00 UTC and label local equivalents. Add a small legend for Work, Overlap, and Offline. Use accessible blue, amber, and gray blocks with precise hour labels.",
    aspectRatio: "16:9",
    check: "Check city order, UTC window, local time conversions, and legend.",
    tested: false,
  },
  {
    id: "info-03",
    category: "Infographic & Data Visualization",
    title: "Coffee Flavor Map",
    useCase: "A product education flavor wheel.",
    prompt: "Create a square infographic titled \"COFFEE FLAVOR MAP\". Center: a coffee cup. First ring: Fruity, Floral, Sweet, Nutty, Spiced, Roasted. Outer ring: twelve specific notes including berry, citrus, jasmine, honey, caramel, almond, cocoa, cinnamon, cedar, smoke, malt, and dark chocolate. Use a clean radial layout with subtle ingredient illustrations.",
    aspectRatio: "1:1",
    check: "Verify six primary categories and all twelve outer labels.",
    tested: false,
  },
  {
    id: "info-04",
    category: "Infographic & Data Visualization",
    title: "Quarterly Business Snapshot",
    useCase: "A compact executive report page.",
    prompt: "Design a 4:3 executive infographic titled \"Q2 BUSINESS SNAPSHOT\". Top KPIs: Revenue $3.8M, Growth +18%, Gross margin 64%, NPS 52. Middle: monthly revenue bars for April, May, June and a donut chart for four customer segments. Bottom: three priorities titled Retention, Expansion, Reliability. Use graphite, off-white, cobalt, and amber.",
    aspectRatio: "4:3",
    check: "Verify four KPIs, three months, segment chart, and priorities.",
    tested: false,
  },
  {
    id: "info-05",
    category: "Infographic & Data Visualization",
    title: "Solar Home Explainer",
    useCase: "A labeled home-energy diagram.",
    prompt: "Create a cutaway infographic titled \"HOW HOME SOLAR WORKS\". Show roof panels, inverter, battery, electrical panel, household appliances, utility meter, and grid. Connect them with directional arrows for daytime generation, battery charging, evening use, and grid export. Add a concise numbered explanation for each component. Use sunlight yellow, navy, white, and mint.",
    aspectRatio: "16:9",
    check: "Check seven component labels and four energy-flow directions.",
    tested: false,
  },
  {
    id: "info-06",
    category: "Infographic & Data Visualization",
    title: "Three-by-Three Learning Grid",
    useCase: "A dense multi-subject educational board.",
    prompt: "Create a 3×3 educational grid titled \"NINE WAYS TO SEE A SYSTEM\". Each cell has a distinct mini-infographic: food web, water cycle, transit map, family tree, computer network, supply chain, solar system, musical harmony, and cell structure. Give every cell a title, two labels, one tiny diagram, and one sentence. Keep borders, typography, and spacing consistent without merging cells.",
    aspectRatio: "1:1",
    check: "Verify nine distinct topics, consistent cells, and no cross-panel interference.",
    tested: false,
  },
  {
    id: "info-07",
    category: "Infographic & Data Visualization",
    title: "Cybersecurity Checklist",
    useCase: "A practical security reference sheet.",
    prompt: "Design a portrait checklist titled \"TEN HABITS FOR A SAFER ACCOUNT\". Include ten numbered rows with icons: unique passwords, password manager, MFA, updates, phishing checks, recovery codes, device lock, backup, session review, and breach alerts. Add a footer callout: \"Security is a routine, not a one-time setup.\" Use dark navy, white, and safety orange.",
    aspectRatio: "9:16",
    check: "Verify all ten habits, numbering, and footer callout.",
    tested: false,
  },
  {
    id: "info-08",
    category: "Infographic & Data Visualization",
    title: "Healthy Meeting Anatomy",
    useCase: "A workplace process diagram.",
    prompt: "Create a landscape infographic titled \"ANATOMY OF A USEFUL MEETING\". Divide it into Before, During, and After. Before: goal, agenda, pre-read. During: owner, timebox, decisions. After: notes, actions, deadlines. Add a central 30-minute timeline and a small anti-pattern box titled \"Skip the meeting when an async update is enough\". Use clean editorial icons.",
    aspectRatio: "16:9",
    check: "Check the three phases, nine actions, timeline, and anti-pattern message.",
    tested: false,
  },
  {
    id: "info-09",
    category: "Infographic & Data Visualization",
    title: "Bilingual Museum Timeline",
    useCase: "A multilingual historical timeline.",
    prompt: "Design a horizontal museum timeline titled \"A CENTURY OF MODERN PRINT / 现代印刷百年\". Mark 1920, 1945, 1968, 1984, 2001, and 2026 with one artifact illustration and a short English and Chinese caption at each point. Use archival paper, black ink, vermilion accents, and precise date alignment. Keep both languages visually balanced.",
    aspectRatio: "16:9",
    check: "Verify six dates, bilingual captions, and chronological order.",
    tested: false,
  },
  {
    id: "info-10",
    category: "Infographic & Data Visualization",
    title: "Public Transit Decision Tree",
    useCase: "A readable branching flowchart.",
    prompt: "Create a vertical decision tree titled \"WHICH TRANSIT PASS DO I NEED?\". Start with \"How many days?\" and branch to 1 day, 2–3 days, 4–7 days. Add branches for airport travel, peak commuting, and group travel. End in four recommendations: Day Pass, Flex 3, Weekly, Visitor Plus. Use rounded nodes, clear arrows, short labels, and distinct accessible colors.",
    aspectRatio: "9:16",
    check: "Verify every question, branch, arrow, and four recommendation endpoints.",
    tested: false,
  },
  {
    id: "story-01",
    category: "Storyboard & Scene",
    title: "Rainy Platform Reunion",
    useCase: "A six-panel emotional storyboard.",
    prompt: "Create a six-panel cinematic storyboard titled \"THE LAST TRAIN HOME\". Panel 1: empty rainy platform. Panel 2: woman checks an old photograph. Panel 3: train lights approach. Panel 4: man steps down carrying one suitcase. Panel 5: silent recognition. Panel 6: they share an umbrella and walk away. Add shot type and one short action note beneath each panel. Blue-hour realism, restrained emotion.",
    aspectRatio: "16:9",
    check: "Check six chronological panels, shot labels, continuity, and the single suitcase.",
    tested: false,
  },
  {
    id: "story-02",
    category: "Storyboard & Scene",
    title: "Product Launch Sequence",
    useCase: "A commercial product-film board.",
    prompt: "Design an eight-panel storyboard for a premium wireless speaker launch. Sequence: dark silhouette, fabric macro, aluminum control detail, sound-wave visualization, speaker in a calm apartment, hand interaction, wide lifestyle scene, final packshot with \"HEAR THE ROOM\". Label camera move, lens feel, and lighting under each panel. Keep the same graphite speaker design throughout.",
    aspectRatio: "16:9",
    check: "Verify eight panels, product continuity, final slogan, and camera notes.",
    tested: false,
  },
  {
    id: "story-03",
    category: "Storyboard & Scene",
    title: "Kitchen Recipe Story",
    useCase: "A step-by-step food preparation board.",
    prompt: "Create a nine-panel overhead storyboard titled \"SUMMER TOMATO TART\". Show ingredients, rolling pastry, arranging tomatoes, seasoning, folding edges, brushing crust, baking, cooling, and serving. Add exact short captions and times where relevant: \"Bake 35 min\" and \"Rest 10 min\". Natural daylight, tactile ceramics, consistent hands and utensils.",
    aspectRatio: "1:1",
    check: "Check nine steps, two times, ingredient continuity, and sequence.",
    tested: false,
  },
  {
    id: "story-04",
    category: "Storyboard & Scene",
    title: "Safety Training Comic",
    useCase: "A clear workplace safety narrative.",
    prompt: "Create a six-panel training comic titled \"STOP, CHECK, LIFT\". A warehouse worker finds a heavy unmarked box, checks the label, clears the route, asks a colleague for help, uses correct lifting posture, and places it safely. Add one concise safety instruction per panel and a final box: \"When in doubt, use lifting equipment.\" Friendly flat illustration, high visibility colors.",
    aspectRatio: "16:9",
    check: "Verify six actions, correct order, PPE continuity, and final safety line.",
    tested: false,
  },
  {
    id: "story-05",
    category: "Storyboard & Scene",
    title: "Mobile App Onboarding",
    useCase: "A product onboarding storyboard.",
    prompt: "Design a seven-panel UX storyboard for a shared-expenses app. Show friends at dinner, one person scans the receipt, the app detects items, users assign dishes, tax and tip are split, payment requests are sent, and everyone sees \"Settled\". Include the relevant mobile screen inside each scene. Use consistent characters, realistic UI labels, and clean editorial illustration.",
    aspectRatio: "16:9",
    check: "Check seven scenes, character continuity, receipt flow, and final Settled state.",
    tested: false,
  },
  {
    id: "story-06",
    category: "Storyboard & Scene",
    title: "Mars Greenhouse Scene",
    useCase: "A science-fiction narrative board.",
    prompt: "Create an eight-panel cinematic storyboard titled \"FIRST HARVEST\". Inside a Mars greenhouse, a botanist discovers the first ripe tomato. Include exterior establishing shot, airlock entry, plant inspection, sensor warning, manual adjustment, close-up of fruit, radio call, and shared meal. Add shot number and action under each frame. Keep suit, greenhouse, and lighting continuity.",
    aspectRatio: "16:9",
    check: "Verify eight shots, sensor-warning resolution, tomato continuity, and Mars setting.",
    tested: false,
  },
  {
    id: "story-07",
    category: "Storyboard & Scene",
    title: "Urban Bicycle Journey",
    useCase: "A transportation campaign storyboard.",
    prompt: "Design a six-frame campaign storyboard following one commuter cycling across a city at dawn. Frames: leaving home, protected lane, river bridge, busy junction, office bike parking, arrival with coffee. Add a short caption to each and end with \"A better commute starts with a connected route.\" Documentary realism, warm sunrise, consistent yellow bicycle.",
    aspectRatio: "16:9",
    check: "Check six locations, yellow bicycle continuity, and final campaign line.",
    tested: false,
  },
  {
    id: "story-08",
    category: "Storyboard & Scene",
    title: "Fantasy Library Discovery",
    useCase: "A richly detailed narrative sequence.",
    prompt: "Create a nine-panel illustrated storyboard titled \"THE BOOK THAT REMEMBERED\". A child enters an old library, follows glowing letters, climbs a spiral stair, finds a locked book, touches the cover, sees a miniature city emerge, recognizes her home, closes the book, and leaves one glowing bookmark. Add one sentence per panel. Maintain character, clothing, and library architecture.",
    aspectRatio: "1:1",
    check: "Verify nine sequential moments, glowing-letter motif, and character continuity.",
    tested: false,
  },
  {
    id: "story-09",
    category: "Storyboard & Scene",
    title: "Customer Support Recovery",
    useCase: "A service-design storyboard.",
    prompt: "Create a six-panel service storyboard titled \"FROM FAILED PAYMENT TO RECOVERY\". Show checkout failure, clear error message, user opens support, agent reviews the account, secure payment retry succeeds, and the user sees restored access. Include interface snippets and concise captions. Avoid showing card numbers or private tokens. Use clean business illustration and accessible status colors.",
    aspectRatio: "16:9",
    check: "Check six states, privacy protection, error-to-success continuity, and status labels.",
    tested: false,
  },
  {
    id: "story-10",
    category: "Storyboard & Scene",
    title: "Fashion Campaign Sequence",
    useCase: "A visual treatment for a fashion shoot.",
    prompt: "Design an eight-frame fashion campaign storyboard titled \"CONCRETE / SILK\". Same model in sculptural ivory tailoring moves through a brutalist gallery: arrival, profile, fabric macro, staircase, mirrored room, seated portrait, wind-blown exterior, final full-body hero. Label framing and movement below each panel. Maintain garment construction, hairstyle, and restrained palette.",
    aspectRatio: "16:9",
    check: "Verify eight frames, garment continuity, camera notes, and location progression.",
    tested: false,
  },
  {
    id: "product-01",
    category: "Product Photography",
    title: "Luxury Fragrance Hero",
    useCase: "A high-end editorial product photograph.",
    prompt: "Create a premium product hero for a fragrance named \"NORTH / 04\". A cobalt glass bottle stands on black volcanic stone with a thin silver cap, one soft side light, precise reflection, faint mist, and generous negative space. Add only the exact bottle label \"NORTH / 04\" and small line \"EAU DE PARFUM\". Photorealistic, controlled studio detail.",
    aspectRatio: "4:3",
    check: "Verify product geometry, two label lines, reflection, and clean negative space.",
    tested: false,
  },
  {
    id: "product-02",
    category: "Product Photography",
    title: "Sustainable Tea Collection",
    useCase: "A packaging family still life.",
    prompt: "Photograph a coordinated set of three premium tea boxes in moss green recycled paper with blind embossing. Exact labels: \"MORNING SENCHA\", \"ROASTED OOLONG\", \"NIGHT JASMINE\". Arrange with loose leaves and one ceramic cup on pale oak. Soft diffused daylight, realistic paper fibers, consistent packaging grid, no extra text.",
    aspectRatio: "4:3",
    check: "Check all three product names, consistent packaging, and material texture.",
    tested: false,
  },
  {
    id: "product-03",
    category: "Product Photography",
    title: "Running Shoe Detail",
    useCase: "A technical sportswear campaign image.",
    prompt: "Create a dynamic studio photograph of a graphite running shoe named \"VECTOR 2\" suspended above a textured track surface. Show breathable knit, reflective heel strip, layered foam sole, and small water droplets. Add three minimal callouts: \"240 g\", \"8 mm drop\", \"Recycled mesh\". High-speed lighting, sharp material detail, orange accent.",
    aspectRatio: "16:9",
    check: "Verify three callouts, shoe construction, logo restraint, and motion clarity.",
    tested: false,
  },
  {
    id: "product-04",
    category: "Product Photography",
    title: "Ceramic Tableware Set",
    useCase: "A calm catalog composition.",
    prompt: "Create an editorial catalog image of a twelve-piece ceramic tableware set in warm white glaze. Arrange four plates, four bowls, and four cups on natural linen with subtle shadows. Add a small catalog caption: \"FIELD SET · 12 PIECES · HAND-FINISHED STONEWARE\". Neutral daylight, accurate count, realistic glaze variation, no food.",
    aspectRatio: "4:3",
    check: "Check exact object count, three-part caption, and material consistency.",
    tested: false,
  },
  {
    id: "product-05",
    category: "Product Photography",
    title: "Smartwatch Feature Grid",
    useCase: "A product image combined with an information layout.",
    prompt: "Design a square product feature grid for a smartwatch called \"PACE ONE\". Center: graphite watch with amber seconds hand. Four surrounding panels: Sleep score 86, Morning run 5.2 km, Battery 72%, Heart rate 68 bpm. Footer labels: \"7-day battery\", \"5 ATM\", \"Dual-band GPS\". Premium dark studio style with readable interface text.",
    aspectRatio: "1:1",
    check: "Verify four metrics, three footer features, and consistent watch design.",
    tested: false,
  },
  {
    id: "product-06",
    category: "Product Photography",
    title: "Skincare Ingredient Story",
    useCase: "A clean beauty product campaign.",
    prompt: "Create a skincare product image for \"CALM BARRIER SERUM\" in a frosted glass dropper bottle. Surround it with oat, ceramide-inspired translucent layers, and a single green leaf. Add exact text: \"30 mL\", \"Fragrance free\", \"For sensitive skin\". Clinical but warm lighting, off-white background, realistic glass and liquid detail.",
    aspectRatio: "4:3",
    check: "Check product name, three claims, dropper geometry, and clean clinical mood.",
    tested: false,
  },
  {
    id: "product-07",
    category: "Product Photography",
    title: "Headphone Exploded View",
    useCase: "A technical product visualization.",
    prompt: "Create a precise exploded-view product image of over-ear headphones titled \"SONA H1\". Separate and label six parts: headband, hinge, outer shell, driver, cushion, control ring. Add a small specification block: \"40 mm driver · Bluetooth 5.4 · 32-hour battery\". Matte aluminum and fabric, white background, fine engineering linework.",
    aspectRatio: "16:9",
    check: "Verify six labeled parts, three specifications, and correct assembly order.",
    tested: false,
  },
  {
    id: "product-08",
    category: "Product Photography",
    title: "Artisan Chocolate Range",
    useCase: "A premium food-packaging photograph.",
    prompt: "Photograph four artisan chocolate bars in a consistent packaging system. Exact names: \"SEA SALT 70%\", \"COFFEE 62%\", \"ORANGE 68%\", \"SMOKED ALMOND 65%\". Arrange wrappers and broken chocolate pieces on dark walnut. Rich side light, embossed paper, precise foil details, sophisticated but natural food styling.",
    aspectRatio: "4:3",
    check: "Verify four flavors, percentages, wrapper consistency, and realistic food texture.",
    tested: false,
  },
  {
    id: "product-09",
    category: "Product Photography",
    title: "Modular Desk System",
    useCase: "A furniture product scene with labeled modules.",
    prompt: "Create a refined interior product image of a modular oak desk system named \"FRAMEWORK 01\". Show desk, monitor shelf, cable tray, side drawer, and pegboard in one warm minimal workspace. Add discreet labels pointing to each module and a footer: \"Configure. Expand. Repair.\" Morning light, accurate joinery, natural materials, no clutter.",
    aspectRatio: "16:9",
    check: "Check five module labels, footer text, joinery, and spatial plausibility.",
    tested: false,
  },
  {
    id: "product-10",
    category: "Product Photography",
    title: "Outdoor Bottle Campaign",
    useCase: "A durable product-in-environment image.",
    prompt: "Create a cinematic product photograph of a stainless outdoor bottle called \"RIDGE 750\" on wet granite beside an alpine stream at dawn. Condensation, scratched matte finish, orange cap loop, distant mist. Add small exact callouts: \"750 mL\", \"18/8 steel\", \"Keeps cold 24 h\". Preserve realistic scale, legible engraving, and natural reflections.",
    aspectRatio: "16:9",
    check: "Verify product name, three callouts, metal texture, and environmental realism.",
    tested: false,
  },
];

export const promptExamples: PromptExample[] = promptTemplates.map((example) => ({
  ...example,
  testRecord: {
    status: "not-run",
    testedAt: null,
    entryPoint: null,
    result: null,
    editorialNote: "Curated from official capability documentation; retain the curated label until a real Qwen Image 3 run and editorial review are recorded.",
  },
}));

export function contentDocumentForPath(pathname: string): ContentDocument | null {
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return contentDocuments.find((document) => document.path === normalized) ?? null;
}

export function contentDocumentsForKind(kind: ContentKind): ContentDocument[] {
  return publishedContentDocuments.filter((document) => document.kind === kind);
}

import { z } from 'zod'
import { TemplateSchema, type Template } from '@/newtab/schemas/template.schema'

// Validate templates at runtime
const TEMPLATES: Template[] = z.array(TemplateSchema).parse([
  {
    id: 'linkedin-posts-summariser',
    name: 'LinkedIn summariser',
    description: 'Summarise latest posts from your LinkedIn feed',
    goal: 'Summarise key posts from the LinkedIn home feed.',
    steps: [
      'Navigate to https://www.linkedin.com/.',
      'If not logged in, ask the user to sign in and resume.',
      'Scroll 3 times to load content.',
      'Extract page content.',
      'Summarise key posts concisely with author names.'
    ],
    notes: [
      "Be concise; don't use slang.",
      'Skip ads and suggested follows.'
    ]
  },
  {
    id: 'twitter-trends-summariser',
    name: 'Twitter/X Key Trends',
    description: 'Capture trending topics and representative tweets',
    goal: 'Identify today’s key trending topics on Twitter/X.',
    steps: [
      'Navigate to https://x.com/',
      'If a sign-in prompt appears, ask the user to log in and resume.',
      'Scroll 3 times to load content.',
      'Extract page content.',
      'Summarise key trends in short bullets.'
    ],
    notes: [
      'Be neutral; avoid speculation.',
      'Skip NSFW or sensitive topics when unclear.'
    ]
  },
  {
    id: 'google-news-summariser',
    name: 'Google News Summariser',
    description: 'Summarise top headlines across sections',
    goal: 'Summarise the top headlines from Google News.',
    steps: [
      'Navigate to https://news.google.com/.',
      'Extract page content.',
      'Summarise major headlines with sources.'
    ],
    notes: [
      'Be concise and factual; no emojis.'
    ]
  },
  {
    id: 'calendar-daily-digest',
    name: 'Calendar Daily Digest',
    description: 'Summarise today’s meetings with time and attendees',
    goal: 'Produce a short daily brief for today’s Google Calendar events.',
    steps: [
      'Navigate to https://calendar.google.com/.',
      'Extract page content.',
      'Summarise today’s events with time and titles.'
    ],
    notes: [
      'Keep it brief and actionable.'
    ]
  },
  {
    id: 'gmail-unread-today',
    name: 'Gmail Unread Today',
    description: 'Summarise today’s unread emails',
    goal: 'Summarise recent unread emails in the inbox.',
    steps: [
      'Navigate to https://mail.google.com/.',
      'If not logged in, ask the user to sign in and resume.',
      'Extract page content.',
      'Summarise unread emails with sender, subject, brief gist.'
    ],
    notes: [
      'Be concise; limit sensitive details.',
      'Do not mark emails read or change settings.'
    ]
  },
  {
    id: 'reddit-top-today',
    name: 'Reddit Top Today',
    description: 'Summarise top Reddit posts today',
    goal: 'Summarise top posts from r/popular (Today).',
    steps: [
      'Navigate to https://www.reddit.com/r/popular/.',
      'Scroll 3 times to load content.',
      'Extract page content.',
      'Summarise key posts/themes with subreddit names.'
    ],
    notes: [
      'Avoid NSFW content; skip if unclear.'
    ]
  },
  {
    id: 'youtube-subscriptions-digest',
    name: 'YouTube Subscriptions Digest',
    description: 'Summarise new videos from Subscriptions',
    goal: 'Summarise notable videos from YouTube Subscriptions.',
    steps: [
      'Navigate to https://www.youtube.com/feed/subscriptions.',
      'If not logged in, ask the user to sign in and resume.',
      'Scroll 3 times to load content.',
      'Extract page content.',
      'Summarise videos with channel and title.'
    ],
    notes: [
      'Keep bullets short; no spoilers.'
    ]
  },
  {
    id: 'hackernews-top',
    name: 'Hacker News Top',
    description: 'Summarise top HN stories',
    goal: 'Summarise top stories from Hacker News.',
    steps: [
      'Navigate to https://news.ycombinator.com/.',
      'extract the top 3 stories url and title.',
      'open story 1 in new tab and extract the content and summarise it.',
      'open story 2 in new tab and extract the content and summarise it.',
      'open story 3 in new tab and extract the content and summarise it.',
      'present the summaries in a concise format.'
    ],
    notes: [
      'Be concise and neutral.'
    ]
  },
  {
    id: 'github-notifications-digest',
    name: 'GitHub Notifications Digest',
    description: 'Summarise unread GitHub notifications',
    goal: 'Summarise unread GitHub notifications by repo.',
    steps: [
      'Navigate to https://github.com/notifications.',
      'If not logged in, ask the user to sign in and resume.',
      'Scroll 3 times to load content.',
      'Extract page content.',
      'Summarise notifications with repo, title, and type.'
    ],
    notes: [
      'Do not change read status or unsubscribe.'
    ]
  },
  {
    id: 'github-pr-review',
    name: 'GitHub PR Review',
    description: 'Summarise a GitHub pull request and flag key changes',
    goal: 'Review the currently open GitHub pull request: summarise what changed, why, and flag any potential issues.',
    steps: [
      'Extract the current page content (PR title, description, and diff summary).',
      'List the files changed and their purpose.',
      'Summarise the intent of the PR based on the description and changes.',
      'Flag any potential bugs, breaking changes, or missing tests mentioned in the diff.',
      'Present a structured review summary.'
    ],
    notes: [
      'Do not leave comments or approve/reject the PR.',
      'Focus on clarity and actionable feedback.'
    ]
  },
  {
    id: 'amazon-price-research',
    name: 'Amazon Price Research',
    description: 'Compare prices and reviews for a product on Amazon',
    goal: 'Research and compare options for a product on Amazon, including prices, ratings, and key features.',
    steps: [
      'Navigate to https://www.amazon.com/.',
      'Ask the user what product they want to research.',
      'Search for the product.',
      'Extract the top 5 results with price, rating, and review count.',
      'Compare the options and recommend the best value for money.',
      'Provide a concise summary table.'
    ],
    notes: [
      'Do not add items to the cart or make purchases.',
      'Focus on objective comparison.'
    ]
  },
  {
    id: 'job-application-tracker',
    name: 'Job Application Tracker',
    description: 'Extract job details from a listing and save them to your notes',
    goal: 'Extract key details from the current job listing and save them as a structured note.',
    steps: [
      'Extract the page content of the current job listing.',
      'Identify: company name, job title, location, salary (if shown), key requirements, and application deadline.',
      'Use page_notes_tool to save a structured note with these details to the current URL.',
      'Summarise the job opportunity and whether it appears to be a good fit based on the requirements.'
    ],
    notes: [
      'Do not apply to the job.',
      'Be concise and factual in the summary.'
    ]
  },
  {
    id: 'travel-planning',
    name: 'Travel Planning',
    description: 'Research flights, hotels, and activities for a destination',
    goal: 'Help plan a trip by researching flights, accommodations, and activities for a destination.',
    steps: [
      'Ask the user for: destination, travel dates, budget, and number of travelers.',
      'Search Google Flights for options matching the criteria.',
      'Extract and summarise the top 3 flight options.',
      'Search for top-rated hotels near the destination center.',
      'Summarise the top 3 hotel options with price and rating.',
      'Suggest 5 popular activities or attractions at the destination.',
      'Present a consolidated travel plan summary.'
    ],
    notes: [
      'Do not book anything.',
      'Always state approximate prices and note they may change.'
    ]
  },
  {
    id: 'deep-research',
    name: 'Deep Research & Summarize',
    description: 'Multi-source deep research on any topic with a structured report',
    goal: 'Conduct deep research on a topic across multiple sources and produce a structured summary report.',
    steps: [
      'Ask the user for the research topic.',
      'Search Google for the topic.',
      'Open the top 3 results in new tabs.',
      'Extract and summarise each source.',
      'Identify key themes, facts, and differing perspectives.',
      'Use session_memory_tool to save key findings under the topic name.',
      'Present a structured report with: Overview, Key Facts, Different Perspectives, Conclusion, and Sources.'
    ],
    notes: [
      'Cite sources with URLs.',
      'Be objective and note any conflicting information.'
    ]
  }
])

export default TEMPLATES

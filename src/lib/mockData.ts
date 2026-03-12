export interface MockJournal {
  id: string;
  name: string;
  icon: string;
  entryCount: number;
  createdAt: string;
}

export interface MockPage {
  id: string;
  journalId: string;
  date: string;
  time: string;
  content: string;
  tags: string[];
  hasImage: boolean;
  hasAttachment: boolean;
  hasLocation: boolean;
}

export const mockJournals: MockJournal[] = [
  {
    id: 'journal-1',
    name: 'Personal',
    icon: 'book',
    entryCount: 3,
    createdAt: '2026-01-15',
  },
  {
    id: 'journal-2',
    name: 'Travel',
    icon: 'map',
    entryCount: 2,
    createdAt: '2026-02-01',
  },
  {
    id: 'journal-3',
    name: 'Work Notes',
    icon: 'briefcase',
    entryCount: 1,
    createdAt: '2026-03-01',
  },
];

export const mockPages: MockPage[] = [
  {
    id: 'page-1',
    journalId: 'journal-1',
    date: '2026-03-12',
    time: '09:30',
    content:
      '# Morning thoughts\n\nToday started with a clear sky and a sense of purpose. I want to focus on **building something meaningful** this week.\n\n> "The best time to plant a tree was 20 years ago. The second best time is now."\n\nTasks for today:\n- Review project plans\n- Write journal entries\n- Go for a walk',
    tags: ['reflection', 'morning', 'goals'],
    hasImage: true,
    hasAttachment: false,
    hasLocation: true,
  },
  {
    id: 'page-2',
    journalId: 'journal-1',
    date: '2026-03-11',
    time: '21:15',
    content:
      '# Evening recap\n\nSpent the afternoon reading about *encryption patterns* for mobile apps. The AES-256-GCM approach seems solid for our use case.\n\nAlso had a great conversation with a friend about open source sustainability.',
    tags: ['evening', 'tech', 'reading'],
    hasImage: false,
    hasAttachment: true,
    hasLocation: false,
  },
  {
    id: 'page-3',
    journalId: 'journal-1',
    date: '2026-03-10',
    time: '14:00',
    content:
      '# Afternoon walk\n\nWent to the park. The spring flowers are starting to bloom. Took some great photos of the cherry blossoms.',
    tags: ['nature', 'walk'],
    hasImage: true,
    hasAttachment: false,
    hasLocation: true,
  },
  {
    id: 'page-4',
    journalId: 'journal-2',
    date: '2026-02-20',
    time: '16:45',
    content:
      '# Lisbon Day 1\n\nArrived in Lisbon in the afternoon. The city is beautiful with its colorful tiles and hilly streets.\n\nVisited:\n- Praca do Comercio\n- Tram 28\n- Time Out Market\n\nThe pasteis de nata were incredible!',
    tags: ['lisbon', 'portugal', 'food'],
    hasImage: true,
    hasAttachment: false,
    hasLocation: true,
  },
  {
    id: 'page-5',
    journalId: 'journal-2',
    date: '2026-02-21',
    time: '10:00',
    content:
      '# Lisbon Day 2\n\nExplored Belem today. The monastery is stunning. Had more pasteis de nata at the famous bakery.',
    tags: ['lisbon', 'portugal', 'sightseeing'],
    hasImage: true,
    hasAttachment: false,
    hasLocation: true,
  },
  {
    id: 'page-6',
    journalId: 'journal-3',
    date: '2026-03-05',
    time: '11:30',
    content:
      "# Sprint planning notes\n\nKey decisions from today's planning:\n\n1. Prioritize the encryption module\n2. Defer backup provider integration to next sprint\n3. Set up CI/CD pipeline this week",
    tags: ['work', 'sprint', 'planning'],
    hasImage: false,
    hasAttachment: true,
    hasLocation: false,
  },
];

export const mockTags = [
  'reflection',
  'morning',
  'goals',
  'evening',
  'tech',
  'reading',
  'nature',
  'walk',
  'travel',
  'food',
  'work',
  'planning',
];

export function getJournalPages(journalId: string): MockPage[] {
  return mockPages.filter((p) => p.journalId === journalId);
}

export function getPage(pageId: string): MockPage | undefined {
  return mockPages.find((p) => p.id === pageId);
}

export function getJournal(journalId: string): MockJournal | undefined {
  return mockJournals.find((j) => j.id === journalId);
}

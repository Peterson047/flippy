export interface NewsArticle {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
  articleText?: string;
  aiSummary?: string;
  isAiSummary?: boolean;
  originalUrl: string;
  sourceName?: string;
  feedUrl?: string;
  imageAiHint?: string;
  category?: string;
  publishedAt?: string;
}

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  isHidden?: boolean;
}

export const DEFAULT_FEEDS: FeedSource[] = [
  {
    id: 'g1-brasil',
    name: 'G1 - Brasil',
    url: 'https://g1.globo.com/rss/g1/brasil/',
    isHidden: false,
  },
  {
    id: 'bbc-brasil',
    name: 'BBC Brasil',
    url: 'https://feeds.bbci.co.uk/portuguese/rss.xml',
    isHidden: false,
  },
  {
    id: 'cnn-brasil',
    name: 'CNN Brasil',
    url: 'https://www.cnnbrasil.com.br/feed/',
    isHidden: false,
  },
  {
    id: 'agencia-brasil',
    name: 'Agência Brasil',
    url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
    isHidden: false,
  },
  {
    id: 'tecnoblog',
    name: 'Tecnoblog',
    url: 'https://tecnoblog.net/feed/',
    isHidden: false,
  },
];

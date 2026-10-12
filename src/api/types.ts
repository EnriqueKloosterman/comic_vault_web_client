export type ReadingStatus = 'unread' | 'reading' | 'completed' | 'archived';

export interface ReadingStateSummary {
  status: ReadingStatus;
  currentPage: number;
  progressPercentage: number;
  isFavorite: boolean;
  lastReadAt: string | null;
  completedAt: string | null;
}

export interface CatalogItem {
  comicId: string;
  filename: string;
  title: string;
  series: string;
  issueNumber: number;
  writer: string | null;
  publicationYear: number | null;
  pageCount: number;
  fileSize: number;
  coverCachePath: string | null;
  lastSyncedAt: string;
  readingState: ReadingStateSummary;
}

export interface CatalogPage {
  data: CatalogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ManifestPage {
  index: number;
  url: string;
}

export interface ComicManifest {
  comicId: string;
  title: string;
  series: string;
  issueNumber: number;
  pageCount: number;
  pages: ManifestPage[];
}

export interface ReadingState {
  _id: string;
  userId: string;
  originalComicId: string;
  title: string;
  series: string;
  issueNumber: number;
  status: ReadingStatus;
  currentPage: number;
  progressPercentage: number;
  isFavorite: boolean;
  lastReadAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface SessionUser {
  userId: string;
  email: string;
}

/** Error RFC7807 del backend. */
export interface Rfc7807Error {
  statusCode: number;
  timestamp: string;
  path: string;
  error: string;
  message: string;
  code: string;
}

export interface Notice {
  id: string; type: string; text: string; applicationId: string | null; read: boolean; createdAt: string;
}
export interface NoticePage { items: Notice[]; total: number; unread: number; page: number; pages: number }

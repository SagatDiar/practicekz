export interface Sig { signed: boolean; at: string | null }
export interface Progress { percent: number; elapsedDays: number; remainingDays: number; totalDays: number }
export interface DiaryEntry { id: string; date: string; text: string }

export interface Application {
  id: string; status: string; statusLabel: string; date: string; startDate: string | null; completedDate: string | null;
  signatures: { student: Sig; company: Sig; university: Sig };
  practice: { id: string; title: string; city: string; direction: string; durationMonths: number; format: string };
  company: { id: string; name: string };
  student: { id: string; firstName: string; lastName: string; faculty: string; specialty: string; course: number; city: string; skills: string } | null;
  university: { id: string; name: string };
  diaryCount: number; reportText: string | null; reportDate: string | null;
  progress: Progress | null; diary?: DiaryEntry[];
}

export interface Practice {
  id: string; title: string; city: string; direction: string; description: string; requirements: string;
  durationMonths: number; format: string; places: number; datePublished: string;
  company: { id: string; name: string }; applicationsCount: number; applied?: boolean;
}

export interface ExtraItem {
  id: string; type: "CERTIFICATE" | "ACHIEVEMENT"; title: string; organization: string; date: string;
  file: { id: string; originalName: string; mime: string; size: number } | null;
}

export interface StudentFull {
  id: string; firstName: string; lastName: string; email: string; photoFileId: string | null; university: string;
  faculty: string; specialty: string; course: number; city: string; skills: string; extra: ExtraItem[];
}

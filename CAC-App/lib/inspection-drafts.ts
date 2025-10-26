type InspectionAnalysis = {
  food_type?: { value?: string | null };
  food_item?: { value?: string | null };
  freshness_rating?: { value?: number | null; confidence?: number | null };
  expiry_date?: { value?: string | null; confidence?: number | null };
  [key: string]: any;
};

type InspectionDraft = {
  analysis: InspectionAnalysis;
  inspectionId: number;
  createdAt?: string;
};

let pendingDraft: InspectionDraft | null = null;

export function setPendingInspectionDraft(draft: InspectionDraft) {
  pendingDraft = draft;
}

export function consumePendingInspectionDraft(): InspectionDraft | null {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
}

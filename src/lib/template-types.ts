export type ApprovedTemplate = { id: string; name: string; language: string; body: string };
export type ManagedTemplate = ApprovedTemplate & { status: string; rejectionReason?: string };

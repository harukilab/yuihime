/**
 * ApprovalGate — opencode-style user approval primitive.
 *
 * Enables Plan Mode (#1) and Permission Gating (#6): Yui pauses the cognitive
 * loop, asks the user for confirmation, and resumes once the reply arrives.
 * The pending request is keyed by contextId with a TTL, so the pause survives
 * across separate think() invocations (the question is delivered as speech,
 * the user's next message resolves the request).
 */
export type ApprovalKind = 'plan' | 'permission';
export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface ApprovalRequest {
  kind: ApprovalKind;
  status: ApprovalStatus;
  summary: string;
  toolNames: string[];
  createdAt: number;
  expiresAt: number;
}

const APPROVAL_TTL_MS = 30 * 60 * 1000;

const APPROVAL_KEYWORDS = /^(ya+|y|iy?a+|setuju|ok|oke|okay|siap|boleh|lanjut(kan)?|teruskan|gas|go|proceed|yes|sure|approve|mangga|monggo|silahkan|silakan|gapapa|sip|done|jalankan|eksekusi|lanjut)/i;
const DENIAL_KEYWORDS = /^(tidak|ngga?k|engga?k|ga|no|jangan|jgn|cancel|batalkan|skip|stop|tunda|ubah|ganti|lain|jangan dulu|belum|tunggu|batal|reject|tolak)/i;

export class ApprovalGate {
  private static instance: ApprovalGate;
  private requests: Map<string, ApprovalRequest> = new Map();
  private approvedTools: Map<string, Set<string>> = new Map();
  private deniedTools: Map<string, Set<string>> = new Map();
  private approvedPlans: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): ApprovalGate {
    if (!ApprovalGate.instance) {
      ApprovalGate.instance = new ApprovalGate();
    }
    return ApprovalGate.instance;
  }

  private prune(ctx: string) {
    const req = this.requests.get(ctx);
    if (req && Date.now() > req.expiresAt) {
      this.requests.delete(ctx);
    }
  }

  requestPlan(contextId: string, summary: string, toolNames: string[]) {
    this.requests.set(contextId, {
      kind: 'plan',
      status: 'pending',
      summary,
      toolNames,
      createdAt: Date.now(),
      expiresAt: Date.now() + APPROVAL_TTL_MS
    });
  }

  requestPermission(contextId: string, toolNames: string[]) {
    this.requests.set(contextId, {
      kind: 'permission',
      status: 'pending',
      summary: `Tool approval needed: ${toolNames.join(', ')}`,
      toolNames,
      createdAt: Date.now(),
      expiresAt: Date.now() + APPROVAL_TTL_MS
    });
  }

  get(contextId: string): ApprovalRequest | null {
    this.prune(contextId);
    return this.requests.get(contextId) || null;
  }

  isPlanApproved(contextId: string): boolean {
    return this.approvedPlans.has(contextId);
  }

  isToolApproved(contextId: string, toolName: string): boolean {
    return this.approvedTools.get(contextId)?.has(toolName) || false;
  }

  isToolDenied(contextId: string, toolName: string): boolean {
    return this.deniedTools.get(contextId)?.has(toolName) || false;
  }

  approve(contextId: string): ApprovalRequest | null {
    const req = this.get(contextId);
    if (!req || req.status !== 'pending') return null;
    req.status = 'approved';
    if (req.kind === 'plan') {
      this.approvedPlans.add(contextId);
    } else {
      const set = this.approvedTools.get(contextId) || new Set<string>();
      req.toolNames.forEach(t => set.add(t));
      this.approvedTools.set(contextId, set);
    }
    return req;
  }

  deny(contextId: string): ApprovalRequest | null {
    const req = this.get(contextId);
    if (!req || req.status !== 'pending') return null;
    req.status = 'denied';
    if (req.kind === 'plan') {
      this.approvedPlans.delete(contextId);
    } else {
      const set = this.deniedTools.get(contextId) || new Set<string>();
      req.toolNames.forEach(t => set.add(t));
      this.deniedTools.set(contextId, set);
    }
    return req;
  }

  clear(contextId: string) {
    this.requests.delete(contextId);
  }

  clearAll() {
    this.requests.clear();
    this.approvedTools.clear();
    this.deniedTools.clear();
    this.approvedPlans.clear();
  }
}

export function isApprovalReply(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return APPROVAL_KEYWORDS.test(t);
}

export function isDenialReply(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return DENIAL_KEYWORDS.test(t);
}

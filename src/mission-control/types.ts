// ============================================================
// Mission Control — Shared Types
// ⚠️  This file is isolated to src/mission-control/.
//     Do NOT import from parent app src/ directories.
// ============================================================

export type TokenId = string;

export interface MCToken {
    id: TokenId;
    /** Which container owns this token */
    location: 'bank' | `case-${number}`;
}

// --------------- Rewards / Goal Pedestals ---------------

export type RewardIcon =
    | 'movie-popcorn'
    | 'show'
    | 'campfire'
    | 'game'
    | 'fishing'
    | 'story-points'
    | 'mystery-box';

export type DisplayCaseStatus = 'empty' | 'selecting' | 'active';

export interface DisplayCase {
    id: number; // 0, 1, 2
    status: DisplayCaseStatus;
    reward: RewardIcon | null;
    /** How many tokens have been deposited */
    tokenCount: number;
    /** How many tokens are needed to complete this goal */
    targetCount: number;
}

// --------------- Privileges / Status Brow ---------------

export type PrivilegeStatus = 'active' | 'suspended' | 'locked';

export interface PrivilegeCard {
    id: string;
    label: string;
    icon: string; // lucide icon name
    status: PrivilegeStatus;
    /** ISO timestamp when suspension ends (null if not suspended) */
    suspendedUntil: string | null;
}

// --------------- Missions ---------------

export type MissionPhase = 'morning' | 'evening' | 'none';

export type MissionTaskId = string;

export interface MissionTask {
    id: MissionTaskId;
    label: string;
    icon: string; // lucide icon name
    completed: boolean;
    /** ISO time string after which this task becomes unavailable */
    locksAt: string | null;
    locked: boolean;
}

export interface Mission {
    phase: MissionPhase;
    /** When the overlay slides in */
    startsAt: string;
    /** When the full lockout triggers */
    endsAt: string;
    durationMins?: number; // computed at trigger time
    /** ISO timestamp when mission was triggered (manual or scheduled).
     *  Also serves as the scheduler's "already ran today" guard.
     *  Preserved on Stop so scheduler won't re-fire; cleared by SET_SETTINGS on time change. */
    startedAt?: string;
    tasks: MissionTask[];
    active: boolean;
}


// --------------- Settings ---------------

export interface MCSettings {
    /** Scheduled trigger time for morning mission (HH:MM) */
    morningStartsAt: string;
    /** Morning mission duration in minutes */
    morningDurationMins: number;
    /** Scheduled trigger time for evening mission (HH:MM) */
    eveningStartsAt: string;
    /** Evening mission duration in minutes */
    eveningDurationMins: number;
}

export const DEFAULT_SETTINGS: MCSettings = {
    morningStartsAt: '06:00',
    morningDurationMins: 30,
    eveningStartsAt: '19:00',
    eveningDurationMins: 60,
};

// --------------- Responsibilities ---------------

export interface ResponsibilityTask {
    id: string;
    label: string;
    icon: string;          // emoji shown in the card header
    pointIcon?: string;    // emoji shown in filled progress dots (defaults to ⭐)
    description: string;   // what the task involves
    rewardLabel: string;   // what reward is unlocked when complete
    pointsRequired: number;
    pointsEarned: number;
    completedAt: string | null; // ISO timestamp when pointsEarned >= pointsRequired
    /** Optional list of specific activity buttons to show instead of the generic +1 button */
    activities?: { emoji: string; label: string }[];
    /** Tokens added to the bank when the parent clicks "Claim & Start Over" */
    tokenReward?: number;
}

// --------------- Root App State ---------------

export interface MCState {
    /** Total tokens in the bank (source of truth count) */
    bankCount: number;
    cases: DisplayCase[];
    privileges: PrivilegeCard[];
    missions: Mission[];
    activeMission: MissionPhase;
    startedAt?: string; // ISO timestamp when the app was loaded/started
    settings: MCSettings;
    responsibilities: ResponsibilityTask[];
}

// --------------- Action Discriminated Union ---------------

export type MCAction =
    | { type: 'ADD_TOKEN' }
    | { type: 'REMOVE_TOKEN' }
    | { type: 'SELECT_CASE'; caseId: number; reward: RewardIcon; targetCount: number }
    | { type: 'DEPOSIT_TO_CASE'; caseId: number; amount: number }
    | { type: 'VACUUM_TO_CASE'; caseId: number }
    | { type: 'REFUND_CASE'; caseId: number }
    | { type: 'SET_PRIVILEGE_STATUS'; cardId: string; status: PrivilegeStatus; suspendedUntil: string | null }
    | { type: 'COMPLETE_TASK'; missionPhase: MissionPhase; taskId: MissionTaskId }
    | { type: 'LOCK_TASK'; missionPhase: MissionPhase; taskId: MissionTaskId }
    | { type: 'SET_ACTIVE_MISSION'; phase: MissionPhase }
    | { type: 'RESET_MISSION'; missionPhase: MissionPhase }
    | { type: 'CANCEL_MISSION'; missionPhase: MissionPhase }
    | { type: 'ADJUST_MISSION_END'; missionPhase: MissionPhase; deltaMinutes: number }
    | { type: 'CONSUME_CASE'; caseId: number }
    | { type: 'SET_SETTINGS'; settings: Partial<MCSettings> }
    | { type: 'ADD_RESPONSIBILITY_POINT'; taskId: string }
    | { type: 'RESET_RESPONSIBILITY'; taskId: string };


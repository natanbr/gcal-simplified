// ============================================================
// Mission Control — Shared Types
// ⚠️  This file is isolated to src/mission-control/.
//     Do NOT import from parent app src/ directories.
// ============================================================

import type { QuizAnswerRecord, SkillProgress } from './skills/types';

export type TokenId = string;

export interface LayoutRects {
    bank: DOMRect | null;
    cases: Record<number, DOMRect | null>;
}

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
    | 'mystery-box'
    | 'bow-arrow'
    | 'quick-game';

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
    startedAt?: string;
    /** Tracks if we already logged the timeout so it doesn't log on remount */
    loggedTimeoutAt?: string;
    tasks: MissionTask[];
    active: boolean;
    whiningDetected?: boolean;
    whiningLocked?: boolean;
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
    /** Optional evening routine add-on for putting on cream */
    creamTaskEnabled: boolean;
    /** How many days the cream routine is required for */
    creamTaskDaysTarget: number;
    /** When the cream task should be scheduled */
    creamTaskSchedule?: 'morning' | 'evening' | 'both';
    /** Custom token costs and enablement state for rewards */
    rewardConfigs?: Record<string, { enabled: boolean; targetCount: number }>;
    /** Remote Control Pairing */
    remoteRoomId?: string;
    /** Remote Control Secret Key */
    remoteKey?: string;
    /** Minutes of inactivity before auto-returning to Calendar view (0 = disabled). */
    autoReturnMins?: number;
}

export const DEFAULT_SETTINGS: MCSettings = {
    morningStartsAt: '06:00',
    morningDurationMins: 30,
    eveningStartsAt: '19:00',
    eveningDurationMins: 60,
    creamTaskEnabled: false,
    creamTaskDaysTarget: 7,
    creamTaskSchedule: 'evening',
    rewardConfigs: {},
    autoReturnMins: 5,
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

export interface ActivityLogEntry {
    id: string;
    timestamp: string; // ISO String
    icon: string; // lucide icon name or emoji
    message: string;
    delta?: number; // e.g., +2, -1
    type: 'manual' | 'system' | 'mission' | 'reward' | 'responsibility' | 'cheat-attempt'; // for filtering / styling
    colorKey?: 'morning' | 'evening' | 'recycling' | 'activity' | 'bank' | 'system' | 'cheat';
    totalTokens?: number;
    bankTokens?: number;
    /** Game-token balance after the event (mood tokens, not bank tokens). */
    gameTokens?: number;
    isRemote?: boolean;
    /**
     * Who caused this entry. `isRemote` only ever answered "phone or not";
     * `source` answers the question a parent actually asks when a token moves
     * on its own: was this a person, the clock, or the app?
     *   local     — someone pressed something on this machine
     *   remote    — arrived over the Supabase remote-control channel
     *   scheduler — the mission scheduler fired on a wall-clock time
     *   auto      — the app itself (mood gauge filling, mission expiry)
     *   system    — lifecycle events (startup, resume, migration)
     */
    source?: 'local' | 'remote' | 'scheduler' | 'auto' | 'system';
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
    /** Tracks remaining days for the cream task (-1 means indefinite/disabled but internal UI logic manages this) */
    creamTaskDaysLeft: number;
    responsibilities: ResponsibilityTask[];
    activityLogs: ActivityLogEntry[];
    hasUnreviewedCheatAttempt: boolean;
    /** Accumulated game tokens (max 5). Earned only by filling the mood gauge. */
    gameTokens: number;
    /** @deprecated Unused since the calendar-day grant was removed. Kept so old
     *  persisted blobs still parse; safe to drop after a storage-key bump. */
    gameTokensLastGrantedDate: string | null;
    /** Track remote animation triggers */
    lastAnimationTrigger?: { type: MCAnimationType; timestamp: number };
    _migrationVersion?: number;
    snakeGameActive: boolean;
    lastCompletedOrFailedMorningDate: string | null;
    lastCompletedOrFailedEveningDate: string | null;
    /** Progress towards next game token (0-100). Increased by good behavior, decreased by whining. */
    behaviorProgress: number;
    /** Global whining status (outside of specific missions) */
    whiningActive: boolean;
    /**
     * Mood level (-2 Horrible .. 0 Neutral .. +2 Excellent). Drives how fast
     * behaviorProgress fills/drains (see MOOD_TOKENS_PER_DAY). Reset to 0 (natural)
     * at the start of each active day; only changed manually / via remote.
     */
    moodWind: number;
    /** ISO timestamp of the last behavior progress calculation */
    behaviorLastUpdated: string;
    /** The last calculated delta in behavior progress (used for UI feedback) */
    behaviorDelta: number;
    /** ISO date string (YYYY-MM-DD) of the last day mood was reset to neutral */
    moodLastResetDate?: string;
    /** Per-skill practice history + the invisible adaptive reading level. */
    skillProgress: SkillProgress;
    /**
     * Consecutive mission occurrences that expired unfinished, shared by
     * morning and evening. Reset to 0 by any completed routine. At
     * MISSED_LOCK_THRESHOLD (6 ≈ three days) the bank and goal pedestals lock;
     * that locked flag is derived from this number, never stored beside it.
     */
    missedMissionStreak: number;
}

export type MCAnimationType =
    | 'fireworks'
    | 'confetti'
    | 'confetti-fireworks'
    | 'good-job'
    | 'too-loud'
    | 'clap'
    | 'thumbs-up'
    | 'slightly-happy'
    | 'triumph'
    | 'scrunched'
    | 'shaking-face'
    | 'hear-no-evil'
    | 'hourglass'
    | 'check-mark'
    | 'cross-mark';

// --------------- Action Discriminated Union ---------------

/**
 * Who dispatched an action. Named `origin` rather than `source` because
 * ADD_TOKENS already carries an unrelated `source` discriminator.
 * Defaults to 'local' when absent — a person pressed something on this machine.
 */
export type ActionOrigin = 'local' | 'remote' | 'scheduler' | 'auto' | 'system';

export type MCAction = (
    | { type: 'ADD_TOKEN' }
    | { type: 'ADD_TOKENS'; amount: number; source: 'manual' | 'mission' | 'responsibility'; label?: string }
    | { type: 'REMOVE_TOKEN' }
    | { type: 'SELECT_CASE'; caseId: number; reward: RewardIcon } // cost: rewardCost(), never the caller's
    | { type: 'DEPOSIT_TO_CASE'; caseId: number; amount: number }
    | { type: 'MOVE_TOKEN'; from: 'bank' | number; to: 'bank' | number }
    | { type: 'VACUUM_TO_CASE'; caseId: number }
    | { type: 'REFUND_CASE'; caseId: number }
    | { type: 'SET_PRIVILEGE_STATUS'; cardId: string; status: PrivilegeStatus; suspendedUntil: string | null }
    | { type: 'EXPIRE_SUSPENSIONS' }
    | { type: 'COMPLETE_TASK'; missionPhase: MissionPhase; taskId: MissionTaskId }
    | { type: 'LOCK_TASK'; missionPhase: MissionPhase; taskId: MissionTaskId }
    | { type: 'SET_ACTIVE_MISSION'; phase: MissionPhase }
    | { type: 'RESET_MISSION'; missionPhase: MissionPhase }
    | { type: 'RESET_MISSION_WITH_TIMER'; missionPhase: MissionPhase }
    | { type: 'CANCEL_MISSION'; missionPhase: MissionPhase }
    | { type: 'COMPLETE_MISSION_ROUTINE'; missionPhase: MissionPhase; bonusTokens: number }
    | { type: 'MARK_MISSION_TIMEOUT'; missionPhase: MissionPhase }
    | { type: 'ADJUST_MISSION_END'; missionPhase: MissionPhase; deltaMinutes: number }
    | { type: 'TOGGLE_WHINING'; missionPhase: MissionPhase; lockedFromUI?: boolean }
    | { type: 'CONSUME_CASE'; caseId: number }
    | { type: 'SET_SETTINGS'; settings: Partial<MCSettings> }
    | { type: 'ADD_RESPONSIBILITY_POINT'; taskId: string; amount?: number }
    | { type: 'RESET_RESPONSIBILITY'; taskId: string; claimTokens?: number }
    | { type: 'ADD_LOG'; log: ActivityLogEntry }
    | { type: 'CHEAT_ATTEMPT' }
    | { type: 'CLEAR_CHEAT_FLAG' }
    | { type: 'GRANT_GAME_TOKEN' }
    | { type: 'CONSUME_GAME_TOKEN' }
    | { type: 'RESET_GAME_TOKENS' }
    | { type: 'TRIGGER_ANIMATION'; animation: MCAnimationType }
    | { type: 'CLEAR_LOGS' }
    | { type: 'START_GAME' }
    | { type: 'END_GAME' }
    | ({ type: 'RECORD_QUIZ_ANSWER' } & QuizAnswerRecord)
    | { type: 'ADJUST_BEHAVIOR_PROGRESS'; amount: number; reason: string }
    | { type: 'BEHAVIOR_TICK' }
    | { type: 'SET_MOOD_WIND'; level: number }
    | { type: 'SYNC_BEHAVIOR' }
    /** Parent hands a shield back (positive delta) or takes one away (negative),
     *  in SEGMENTS. Positive is always the kind direction, so the remote's
     *  "+ shield" button is `delta: 1` and needs no sign gymnastics. */
    | { type: 'ADJUST_SHIELD'; delta: number }
) & { isRemote?: boolean; timestamp?: string; origin?: ActionOrigin };

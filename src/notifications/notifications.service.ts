import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, IsNull, Between } from 'typeorm';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationPreferences } from '../entities/notification-preferences.entity';
import { DailyStat } from '../entities/daily-stat.entity';
import { User } from '../entities/user.entity';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import {
  APP_LINK,
  STREAK_MILESTONES,
  comebackCopy,
  dailyGoalCopy,
  dailyNudgeCopy,
  dedupeKey,
  focusCompleteCopy,
  focusMilestoneCopy,
  globalTopCopy,
  rankPassedCopy,
  streakAtRiskCopy,
  streakMilestoneCopy,
  streakUpdateCopy,
  weeklyRankCopy,
} from './notification-copy';
import { MailService } from '../mail/mail.service';
import { TemplatePickerService } from './template-picker.service';
import { renderTemplate } from './template-render';
import { StorageService } from '../storage/storage.service';
import { resolveInlineEmailImage } from '../mail/email-inline-image';
import { stripHtml } from '../mail/notification-card-email';
import {
  addDaysYmd,
  buildWeekDaysFromStats,
  StreakWeekDay,
} from '../mail/streak-update-email';
import {
  LeaderboardEmailRow,
  SAMPLE_LEADERBOARD_ROWS,
} from '../mail/leaderboard-email';
import { todayInTz } from '../common/time';
import { greetingName } from '../common/greeting-name';
import { policyFor } from './notification-policy';
import {
  crossedMilestone,
  goalCrossed,
  GLOBAL_TOP_N,
  isGlobalTop,
  shouldAnnounceSessionCount,
} from './notification-eligibility';
import { NotificationStatsService } from './notification-stats.service';
import { NotificationQueueService } from './notification-queue.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import type { PomodoroCompletedJob } from './notification-jobs.types';
import type { PrefKey } from './notification-policy';

interface CreateParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
}

export const IMAGES = {
  mad: 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-mad.png',
  sad: 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-sad.png',
  yay: 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-yay.png',
  super: 'https://pomopal.s3.us-east-2.amazonaws.com/pomo-super.png',
} as const;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err as QueryFailedError & { driverError?: { code?: string } }).driverError
      ?.code === '23505'
  );
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationPreferences)
    private readonly prefsRepo: Repository<NotificationPreferences>,
    @InjectRepository(DailyStat)
    private readonly dailyStatRepo: Repository<DailyStat>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
    private readonly templatePicker: TemplatePickerService,
    private readonly storage: StorageService,
    private readonly stats: NotificationStatsService,
    private readonly queue: NotificationQueueService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  private prefsAllows(
    prefs: NotificationPreferences,
    key: PrefKey,
  ): boolean {
    return Boolean(prefs[key]);
  }

  async ensurePreferences(userId: string): Promise<NotificationPreferences> {
    const existing = await this.prefsRepo.findOneBy({ user_id: userId });
    if (existing) return existing;
    return this.prefsRepo.save(this.prefsRepo.create({ user_id: userId }));
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.ensurePreferences(userId);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const prefs = await this.ensurePreferences(userId);
    Object.assign(prefs, dto);
    return this.prefsRepo.save(prefs);
  }

  async createIfNew(params: CreateParams): Promise<Notification | null> {
    const existing = await this.notificationRepo.findOne({
      where: { dedupe_key: params.dedupeKey },
    });
    if (existing) return null;

    try {
      return await this.notificationRepo.save(
        this.notificationRepo.create({
          user_id: params.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          dedupe_key: params.dedupeKey,
          read_at: null,
        }),
      );
    } catch (err) {
      if (isDuplicateKeyError(err)) return null;
      throw err;
    }
  }

  async listForUser(userId: string, limit = 50): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { user_id: userId, read_at: IsNull() },
    });
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const row = await this.notificationRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (!row.read_at) {
      row.read_at = new Date();
      await this.notificationRepo.save(row);
    }
    return row;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { user_id: userId, read_at: IsNull() },
      { read_at: new Date() },
    );
  }

  async onPomodoroComplete(
    userId: string,
    sessionId: string,
    currentStreak: number,
    userTimeZone: string,
    email?: string,
    extras?: {
      creditedMinutes: number;
      allTimeMinutesBefore: number;
      weekMinutesBefore: number;
    },
  ): Promise<void> {
    const tz = userTimeZone;
    const today = todayInTz(tz);
    const credited = extras?.creditedMinutes ?? 0;
    const allTimeBefore =
      extras?.allTimeMinutesBefore ??
      Math.max(0, (await this.stats.allTimeMinutes(userId)) - credited);
    const weekBefore =
      extras?.weekMinutesBefore ??
      Math.max(0, (await this.stats.weekMinutes(userId, today)) - credited);

    try {
      await this.queue.enqueuePomodoroCompleted({
        v: 1,
        userId,
        sessionId,
        email: email ?? '',
        tz,
        today,
        currentStreak,
        creditedMinutes: credited,
        allTimeMinutesBefore: allTimeBefore,
        weekMinutesBefore: weekBefore,
      });
    } catch (err) {
      this.logger.warn(
        `Queue enqueue failed; running pomodoro handlers inline: ${err instanceof Error ? err.message : err}`,
      );
      await this.handlePomodoroCompleted({
        v: 1,
        userId,
        sessionId,
        email: email ?? '',
        tz,
        today,
        currentStreak,
        creditedMinutes: credited,
        allTimeMinutesBefore: allTimeBefore,
        weekMinutesBefore: weekBefore,
      });
    }
  }

  async handlePomodoroCompleted(job: PomodoroCompletedJob): Promise<void> {
    const {
      userId,
      currentStreak,
      email,
      today,
      creditedMinutes,
      allTimeMinutesBefore,
      weekMinutesBefore,
    } = job;
    const mail = email || undefined;
    const prefs = await this.ensurePreferences(userId);

    if (
      prefs.streak_updates &&
      (STREAK_MILESTONES as readonly number[]).includes(currentStreak)
    ) {
      await this.notifyWithTemplate({
        userId,
        type: 'streak_milestone',
        context: { streak: currentStreak, today },
        dedupeKey: dedupeKey('streak_milestone', userId, String(currentStreak)),
        fallback: () => streakMilestoneCopy(currentStreak),
        fallbackImage: IMAGES.yay,
        email: mail,
      });
    }

    const sessionCount = await this.stats.todaySessionCount(userId, today);
    if (shouldAnnounceSessionCount(sessionCount)) {
      await this.notifyFocusComplete(userId, today, sessionCount, mail);
    }

    const todayMinutes = await this.stats.todayMinutes(userId, today);
    const goal = prefs.daily_goal_minutes ?? 25;
    const beforeToday = Math.max(0, todayMinutes - creditedMinutes);
    if (goalCrossed(beforeToday, todayMinutes, goal)) {
      await this.notifyDailyGoal(userId, today, todayMinutes, goal, mail);
    }

    const allTimeAfter = allTimeMinutesBefore + creditedMinutes;
    const milestone = crossedMilestone(allTimeMinutesBefore, allTimeAfter);
    if (milestone != null) {
      await this.notifyFocusMilestone(userId, milestone, mail);
    }

    const weekAfter = weekMinutesBefore + creditedMinutes;
    const passed = await this.leaderboard.usersPassedOnWeek(
      userId,
      weekMinutesBefore,
      weekAfter,
    );
    for (const other of passed.slice(0, 3)) {
      await this.notifyRankPassed({
        userId,
        email: mail,
        today,
        otherName: other.name,
        direction: 'you_passed',
        minutes: weekAfter,
        otherUserId: other.userId,
      });

      const passedUser = await this.userRepo.findOne({
        where: { id: other.userId },
        select: ['id', 'email', 'name', 'username'],
      });
      const actor = await this.userRepo.findOne({
        where: { id: userId },
        select: ['name', 'username'],
      });
      await this.notifyRankPassed({
        userId: other.userId,
        email: passedUser?.email,
        today,
        otherName: greetingName(
          actor ?? { name: null, username: 'Someone' },
        ),
        direction: 'passed_you',
        minutes: weekAfter,
        otherUserId: userId,
        actorId: userId,
      });
    }

    const rank = await this.leaderboard.getGlobalWeekRank(userId);
    if (isGlobalTop(rank)) {
      await this.notifyGlobalTop(userId, today, rank!, mail);
    }
  }

  async notifyFocusComplete(
    userId: string,
    today: string,
    sessionCount: number,
    email?: string,
  ): Promise<void> {
    await this.notifyWithTemplate({
      userId,
      type: 'focus_complete',
      context: { today, sessionCount },
      dedupeKey: dedupeKey(
        'focus_complete',
        userId,
        `${today}:${sessionCount}`,
      ),
      fallback: () => focusCompleteCopy(),
      fallbackImage: IMAGES.yay,
      email,
    });
  }

  async notifyDailyGoal(
    userId: string,
    today: string,
    minutes: number,
    goal: number,
    email?: string,
  ): Promise<void> {
    await this.notifyWithTemplate({
      userId,
      type: 'daily_goal',
      context: { today, minutes, goal },
      dedupeKey: dedupeKey('daily_goal', userId, today),
      fallback: () => dailyGoalCopy(minutes, goal),
      fallbackImage: IMAGES.super,
      email,
    });
  }

  async notifyFocusMilestone(
    userId: string,
    totalMinutes: number,
    email?: string,
  ): Promise<void> {
    await this.notifyWithTemplate({
      userId,
      type: 'focus_milestone',
      context: { totalMinutes },
      dedupeKey: dedupeKey(
        'focus_milestone',
        userId,
        String(totalMinutes),
      ),
      fallback: () => focusMilestoneCopy(totalMinutes),
      fallbackImage: IMAGES.yay,
      email,
    });
  }

  async notifyWeeklyRank(params: {
    userId: string;
    email?: string;
    today: string;
    weekMinutes: number;
    weekSessions: number;
    rank?: number | null;
  }): Promise<void> {
    const { userId, email, today, weekMinutes, weekSessions, rank } = params;
    await this.notifyWithTemplate({
      userId,
      type: 'weekly_rank',
      context: {
        today,
        weekMinutes,
        weekSessions,
        ...(rank != null ? { rank, rankLabel: `#${rank}` } : {}),
      },
      dedupeKey: dedupeKey('weekly_rank', userId, today),
      fallback: () =>
        weeklyRankCopy({ weekMinutes, weekSessions, rank }),
      fallbackImage: IMAGES.super,
      email,
    });
  }

  async notifyRankPassed(params: {
    userId: string;
    email?: string;
    today: string;
    otherName: string;
    direction: 'passed_you' | 'you_passed';
    minutes: number;
    otherUserId: string;
    actorId?: string;
  }): Promise<void> {
    const {
      userId,
      email,
      today,
      otherName,
      direction,
      minutes,
      otherUserId,
      actorId,
    } = params;
    await this.notifyWithTemplate({
      userId,
      type: 'rank_passed',
      context: { today, otherName, direction, minutes },
      dedupeKey: dedupeKey(
        'rank_passed',
        userId,
        `${today}:${direction}:${otherUserId}:${actorId ?? 'self'}`,
      ),
      fallback: () => rankPassedCopy({ otherName, direction, minutes }),
      fallbackImage: IMAGES.super,
      email,
    });
  }

  async notifyGlobalTop(
    userId: string,
    today: string,
    rank: number,
    email?: string,
  ): Promise<void> {
    await this.notifyWithTemplate({
      userId,
      type: 'global_top',
      context: { today, rank },
      dedupeKey: dedupeKey('global_top', userId, `${today}:${rank}`),
      fallback: () => globalTopCopy(rank),
      fallbackImage: IMAGES.yay,
      email,
    });
  }

  async notifyStreakUpdate(
    userId: string,
    currentStreak: number,
    today: string,
    email?: string,
    extraContext: Record<string, unknown> = {},
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.streak_updates) return;

    await this.notifyWithTemplate({
      userId,
      type: 'streak_update',
      context: {
        streak: currentStreak,
        today,
        ...extraContext,
      },
      dedupeKey: dedupeKey('streak_update', userId, today),
      fallback: () => streakUpdateCopy(currentStreak),
      fallbackImage: IMAGES.super,
      email,
    });
  }

  async notifyStreakAtRisk(
    userId: string,
    currentStreak: number,
    today: string,
    email?: string,
    isLastChance = false,
    extraContext: Record<string, unknown> = {},
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.streak_nudges) return;

    // Temporarily use streak_update templates/copy instead of streak_at_risk.
    const suffix = isLastChance ? `${today}:last` : `${today}:early`;
    await this.notifyWithTemplate({
      userId,
      type: 'streak_update',
      context: {
        streak: currentStreak,
        isLastChance,
        today,
        ...extraContext,
      },
      dedupeKey: dedupeKey('streak_update', userId, suffix),
      fallback: () => streakUpdateCopy(currentStreak),
      fallbackImage: IMAGES.mad,
      email,
      prefKey: 'streak_nudges',
    });
  }
  async notifyDailyNudge(
    userId: string,
    today: string,
    email?: string,
    extraContext: Record<string, unknown> = {},
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.streak_nudges) return;

    await this.notifyWithTemplate({
      userId,
      type: 'daily_nudge',
      context: { today, ...extraContext },
      dedupeKey: dedupeKey('daily_nudge', userId, today),
      fallback: () => dailyNudgeCopy(),
      fallbackImage: IMAGES.sad,
      email,
    });
  }

  async notifyComeback(
    userId: string,
    daysAway: number,
    email?: string,
    extraContext: Record<string, unknown> = {},
  ): Promise<void> {
    const prefs = await this.ensurePreferences(userId);
    if (!prefs.inactive_reminders) return;

    await this.notifyWithTemplate({
      userId,
      type: 'comeback',
      context: { daysAway, ...extraContext },
      dedupeKey: dedupeKey('comeback', userId, `${daysAway}d`),
      fallback: () => comebackCopy(daysAway),
      fallbackImage: IMAGES.sad,
      email,
    });
  }

  async userAllowsAnnouncements(userId: string): Promise<boolean> {
    const prefs = await this.ensurePreferences(userId);
    return prefs.product_announcements;
  }

  async sendTestNotification(params: {
    userId: string;
    email: string;
    type: NotificationType;
    templateId?: string;
    sendEmail?: boolean;
    context: Record<string, unknown>;
  }) {
    const context = await this.withGreetingContext(
      params.userId,
      params.context,
    );
    let title: string;
    let body: string;
    let imageUrl = this.fallbackImageForType(params.type);
    let source: 'template' | 'fallback' = 'fallback';
    let templateName: string | null = null;
    let showProgress = this.defaultShowProgress(params.type);
    let showLeaderboard = this.defaultShowLeaderboard(params.type);

    if (params.templateId) {
      const template = await this.templatePicker.findById(params.templateId);
      if (!template) throw new NotFoundException('Template not found');
      title = renderTemplate(template.title, context);
      body = renderTemplate(template.body, context);
      imageUrl = template.image_url ?? imageUrl;
      source = 'template';
      templateName = template.name;
      showProgress = this.templateShowProgress(template);
      showLeaderboard = this.templateShowLeaderboard(template);
    } else {
      const templatesConfigured = await this.templatePicker.hasActiveTemplates(
        params.type,
      );
      const template = await this.templatePicker.pickTemplate(
        params.type,
        context,
      );
      if (template) {
        title = renderTemplate(template.title, context);
        body = renderTemplate(template.body, context);
        imageUrl = template.image_url ?? imageUrl;
        source = 'template';
        templateName = template.name;
        showProgress = this.templateShowProgress(template);
        showLeaderboard = this.templateShowLeaderboard(template);
      } else if (templatesConfigured) {
        throw new NotFoundException(
          'No eligible template for this type and context',
        );
      } else {
        const copy = this.fallbackCopyForType(params.type, context);
        title = copy.title;
        body = copy.body;
      }
    }

    ({ title, body } = this.normalizeCopy(params.type, title, body));

    const dedupeKey = `test:${params.type}:${params.userId}:${Date.now()}`;
    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({
        user_id: params.userId,
        type: params.type,
        title,
        body,
        dedupe_key: dedupeKey,
        read_at: null,
      }),
    );

    let emailSent = false;
    if (params.sendEmail !== false) {
      await this.sendNudgeEmailInline(params.email, title, body, imageUrl, {
        type: params.type,
        userId: params.userId,
        todayYmd:
          typeof context.today === 'string' ? context.today : undefined,
        showProgress,
        showLeaderboard,
      });
      emailSent = this.mailService.isConfigured();
    }

    return {
      notification,
      title,
      body,
      source,
      templateName,
      emailSent,
    };
  }

  async sendAdminDirectMessage(params: {
    userId: string;
    email: string;
    type: NotificationType;
    title: string;
    body: string;
    htmlBody?: string;
    imageSource?: string;
    sendEmail?: boolean;
    dedupeKey: string;
  }) {
    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({
        user_id: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        dedupe_key: params.dedupeKey,
        read_at: null,
      }),
    );

    let emailSent = false;
    if (params.sendEmail !== false) {
      await this.sendNudgeEmailInline(
        params.email,
        params.title,
        params.htmlBody ?? params.body,
        params.imageSource,
      );
      emailSent = this.mailService.isConfigured();
    }

    return { notification, emailSent };
  }

  async sendAdminEmail(params: {
    to: string;
    title: string;
    htmlBody: string;
    imageSource?: string;
  }): Promise<void> {
    await this.sendNudgeEmailInline(
      params.to,
      params.title,
      params.htmlBody,
      params.imageSource,
    );
  }

  private fallbackImageForType(type: NotificationType): string {
    switch (type) {
      case 'streak_update':
        return IMAGES.super;
      case 'streak_at_risk':
        return IMAGES.mad;
      case 'streak_milestone':
      case 'focus_complete':
      case 'focus_milestone':
      case 'global_top':
        return IMAGES.yay;
      case 'daily_nudge':
      case 'comeback':
        return IMAGES.sad;
      default:
        return IMAGES.super;
    }
  }

  private fallbackCopyForType(
    type: NotificationType,
    context: Record<string, unknown>,
  ): { title: string; body: string } {
    const streak = Number(context.streak ?? 7);
    const daysAway = Number(context.daysAway ?? 5);
    const isLastChance = Boolean(context.isLastChance);
    const minutes = Number(context.minutes ?? 25);
    const goal = Number(context.goal ?? 25);
    const totalMinutes = Number(context.totalMinutes ?? 500);
    const weekMinutes = Number(context.weekMinutes ?? 100);
    const weekSessions = Number(context.weekSessions ?? 4);
    const rank =
      context.rank === '' || context.rank == null
        ? null
        : Number(context.rank);
    const otherName = String(context.otherName ?? 'Alex');
    const direction =
      context.direction === 'passed_you' ? 'passed_you' : 'you_passed';

    switch (type) {
      case 'streak_update':
        return streakUpdateCopy(streak);
      case 'streak_at_risk':
        return streakAtRiskCopy(streak, isLastChance);
      case 'streak_milestone':
        return streakMilestoneCopy(streak);
      case 'daily_nudge':
        return dailyNudgeCopy();
      case 'comeback':
        return comebackCopy(daysAway);
      case 'focus_complete':
        return focusCompleteCopy();
      case 'daily_goal':
        return dailyGoalCopy(minutes, goal);
      case 'focus_milestone':
        return focusMilestoneCopy(totalMinutes);
      case 'weekly_rank':
        return weeklyRankCopy({ weekMinutes, weekSessions, rank });
      case 'rank_passed':
        return rankPassedCopy({ otherName, direction, minutes });
      case 'global_top':
        return globalTopCopy(rank ?? 1);
      default:
        return { title: 'Test notification', body: 'This is a test from admin.' };
    }
  }

  private async notifyWithTemplate(params: {
    userId: string;
    type: NotificationType;
    context: Record<string, unknown>;
    dedupeKey: string;
    fallback: () => { title: string; body: string };
    fallbackImage: string;
    email?: string;
    /** Override preference gate (e.g. at-risk copy using streak_update templates). */
    prefKey?: PrefKey;
  }): Promise<Notification | null> {
    const policy = policyFor(params.type);
    const prefs = await this.ensurePreferences(params.userId);
    if (!this.prefsAllows(prefs, params.prefKey ?? policy.pref)) return null;

    const context = await this.withGreetingContext(
      params.userId,
      params.context,
    );
    let title: string;
    let body: string;
    let imageUrl = params.fallbackImage;
    let showProgress = this.defaultShowProgress(params.type);
    let showLeaderboard = this.defaultShowLeaderboard(params.type);

    const templatesConfigured = await this.templatePicker.hasActiveTemplates(
      params.type,
    );

    const template = await this.templatePicker.pickTemplate(
      params.type,
      context,
    );

    if (template) {
      title = renderTemplate(template.title, context);
      body = renderTemplate(template.body, context);
      imageUrl = template.image_url ?? params.fallbackImage;
      showProgress = this.templateShowProgress(template);
      showLeaderboard = this.templateShowLeaderboard(template);
    } else if (templatesConfigured) {
      this.logger.debug(
        `Skipped ${params.type} for ${params.userId}: no eligible template`,
      );
      return null;
    } else {
      const copy = params.fallback();
      title = copy.title;
      body = copy.body;
    }

    ({ title, body } = this.normalizeCopy(params.type, title, body));

    const created = await this.createIfNew({
      userId: params.userId,
      type: params.type,
      title,
      body,
      dedupeKey: params.dedupeKey,
    });

    if (created && params.email && policy.email) {
      await this.sendNudgeEmail(params.email, title, body, imageUrl, {
        type: params.type,
        userId: params.userId,
        todayYmd:
          typeof context.today === 'string' ? context.today : undefined,
        showProgress,
        showLeaderboard,
      });
    }

    return created;
  }

  /** {{username}} → first name, else username handle. */
  private async withGreetingContext(
    userId: string,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let next = { ...context };
    if (!(typeof next.username === 'string' && next.username.trim())) {
      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: ['name', 'username'],
      });
      if (user) next = { ...next, username: greetingName(user) };
    }
    return this.withLeagueContext(userId, next);
  }

  /** Streak emails use plain text — strip rich-editor font tags. */
  private normalizeCopy(
    type: NotificationType,
    title: string,
    body: string,
  ): { title: string; body: string } {
    if (
      !this.isStreakUpdateType(type) &&
      !this.isLeaderboardType(type) &&
      type !== 'daily_nudge' &&
      type !== 'comeback'
    ) {
      return { title, body };
    }
    return {
      title: stripHtml(title) || title,
      body: stripHtml(body) || body,
    };
  }

  private defaultShowProgress(type: NotificationType): boolean {
    return this.isStreakUpdateType(type);
  }

  private defaultShowLeaderboard(type: NotificationType): boolean {
    return this.isLeaderboardType(type);
  }

  private templateShowProgress(template: {
    eligibility_rules?: Record<string, unknown> | null;
  }): boolean {
    const rules = template.eligibility_rules ?? {};
    if (typeof rules.showProgress === 'boolean') return rules.showProgress;
    return true;
  }

  private templateShowLeaderboard(template: {
    eligibility_rules?: Record<string, unknown> | null;
  }): boolean {
    const rules = template.eligibility_rules ?? {};
    if (typeof rules.showLeaderboard === 'boolean') return rules.showLeaderboard;
    return true;
  }

  private isStreakUpdateType(type?: NotificationType): boolean {
    return (
      type === 'streak_update' ||
      type === 'streak_at_risk' ||
      type === 'streak_milestone'
    );
  }

  private isLeaderboardType(type?: NotificationType): boolean {
    return (
      type === 'weekly_rank' ||
      type === 'rank_passed' ||
      type === 'global_top'
    );
  }

  private leaderboardEmailFooter(type?: NotificationType): string {
    if (type === 'global_top') {
      return 'Defend your spot — the board resets every week.';
    }
    if (type === 'rank_passed') {
      return 'One more pomodoro can flip the board again.';
    }
    return 'Climb the board with another pomodoro!';
  }

  private async buildLeaderboardRowsForUser(
    userId: string,
  ): Promise<LeaderboardEmailRow[]> {
    try {
      const top = await this.leaderboard.getGlobalWeekLeaderboard(null);
      const rows: LeaderboardEmailRow[] = top.slice(0, GLOBAL_TOP_N).map((e) => ({
        rank: e.rank,
        name: greetingName({ name: e.name, username: e.username }),
        minutes: e.focus_minutes,
        isYou: e.user_id === userId,
      }));

      if (rows.some((r) => r.isYou)) return rows;

      const board = await this.leaderboard.getGlobalWeekLeaderboard(userId);
      const viewer = board.find((e) => e.user_id === userId);
      if (viewer) {
        rows.push({
          rank: viewer.rank,
          name: greetingName({ name: viewer.name, username: viewer.username }),
          minutes: viewer.focus_minutes,
          isYou: true,
          gapBefore: rows.length > 0,
        });
      }

      return rows.length > 0 ? rows : SAMPLE_LEADERBOARD_ROWS;
    } catch (err) {
      this.logger.warn(
        `Leaderboard rows for email failed: ${err instanceof Error ? err.message : err}`,
      );
      return SAMPLE_LEADERBOARD_ROWS;
    }
  }

  /** Fill rank / week stats so templates never render bare "#". */
  private async withLeagueContext(
    userId: string,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const next = { ...context };
    try {
      if (next.rank === undefined || next.rank === null || next.rank === '') {
        const rank = await this.leaderboard.getGlobalWeekRank(userId);
        if (rank != null) {
          next.rank = rank;
        } else {
          const minutes =
            typeof next.weekMinutes === 'number'
              ? next.weekMinutes
              : await this.stats.weekMinutes(
                  userId,
                  typeof next.today === 'string'
                    ? next.today
                    : new Date().toISOString().slice(0, 10),
                );
          if (minutes > 0) {
            const board = await this.leaderboard.getGlobalWeekLeaderboard(
              userId,
            );
            const self = board.find((e) => e.user_id === userId);
            if (self) next.rank = self.rank;
          }
        }
      }
      if (next.weekMinutes === undefined) {
        next.weekMinutes = await this.stats.weekMinutes(
          userId,
          typeof next.today === 'string'
            ? next.today
            : new Date().toISOString().slice(0, 10),
        );
      }
      if (next.weekSessions === undefined) {
        next.weekSessions = await this.stats.weekSessionCount(
          userId,
          typeof next.today === 'string'
            ? next.today
            : new Date().toISOString().slice(0, 10),
        );
      }
    } catch (err) {
      this.logger.warn(
        `League context enrich failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (next.rank !== undefined && next.rank !== null && next.rank !== '') {
      next.rankLabel = `#${next.rank}`;
    } else {
      next.rank = '';
      next.rankLabel = '';
    }
    return next;
  }

  private async weekDaysForUser(
    userId: string,
    todayYmd: string,
  ): Promise<StreakWeekDay[]> {
    const from = addDaysYmd(todayYmd, -6);
    const rows = await this.dailyStatRepo.find({
      where: {
        user: { id: userId },
        date: Between(from, todayYmd),
      },
      select: ['date', 'session_count'],
    });
    const completed = rows
      .filter((r) => r.session_count > 0)
      .map((r) => r.date);
    return buildWeekDaysFromStats(todayYmd, completed);
  }

  private streakEmailFooter(type?: NotificationType): string {
    if (type === 'streak_milestone') {
      return "You're on fire — keep it going tomorrow!";
    }
    if (type === 'streak_update') {
      return 'Keep your streak alive with a pomodoro!';
    }
    return 'Save your streak with a pomodoro!';
  }

  private async sendNudgeEmail(
    to: string,
    title: string,
    body: string,
    imageSource?: string,
    meta?: {
      type?: NotificationType;
      userId?: string;
      todayYmd?: string;
      showProgress?: boolean;
      showLeaderboard?: boolean;
    },
  ): Promise<void> {
    if (!this.mailService.isConfigured()) {
      this.logger.warn(`SMTP not configured; skipped email to ${to}`);
      return;
    }
    try {
      const enriched = await this.enrichEmailMeta(meta);
      await this.queue.enqueueSendEmail({
        v: 1,
        to,
        title,
        body,
        imageSource,
        meta: enriched,
      });
    } catch (err) {
      this.logger.warn(
        `Email queue failed; sending inline: ${err instanceof Error ? err.message : err}`,
      );
      await this.sendNudgeEmailInline(to, title, body, imageSource, meta);
    }
  }

  private async enrichEmailMeta(meta?: {
    type?: NotificationType;
    userId?: string;
    todayYmd?: string;
    showProgress?: boolean;
    showLeaderboard?: boolean;
  }): Promise<{
    type?: NotificationType;
    userId?: string;
    todayYmd?: string;
    showProgress?: boolean;
    showLeaderboard?: boolean;
    leaderboardRows?: LeaderboardEmailRow[];
  }> {
    if (!meta) return {};
    const out: {
      type?: NotificationType;
      userId?: string;
      todayYmd?: string;
      showProgress?: boolean;
      showLeaderboard?: boolean;
      leaderboardRows?: LeaderboardEmailRow[];
    } = { ...meta };
    if (
      this.isLeaderboardType(meta.type) &&
      meta.showLeaderboard !== false &&
      meta.userId
    ) {
      out.leaderboardRows = await this.buildLeaderboardRowsForUser(meta.userId);
    }
    return out;
  }

  /** Direct send used by admin test when queue is unavailable, and as fallback. */
  async sendNudgeEmailInline(
    to: string,
    title: string,
    body: string,
    imageSource?: string,
    meta?: {
      type?: NotificationType;
      userId?: string;
      todayYmd?: string;
      showProgress?: boolean;
      showLeaderboard?: boolean;
    },
  ): Promise<void> {
    try {
      const { inlineImage, imageUrl } = await resolveInlineEmailImage(
        imageSource,
        (stored) => this.storage.getObjectBuffer(stored),
        { publicUrlForKey: (key) => this.storage.objectPublicUrl(key) },
      );

      const streakUpdate = this.isStreakUpdateType(meta?.type);
      const leaderboard = this.isLeaderboardType(meta?.type);
      const includeProgress = meta?.showProgress !== false;
      const includeBoard = meta?.showLeaderboard !== false;

      let weekDays: StreakWeekDay[] = [];
      if (streakUpdate && includeProgress && meta?.userId) {
        const today =
          meta.todayYmd ?? new Date().toISOString().slice(0, 10);
        weekDays = await this.weekDaysForUser(meta.userId, today);
      }

      let leaderboardRows: LeaderboardEmailRow[] = [];
      if (leaderboard && includeBoard && meta?.userId) {
        leaderboardRows = await this.buildLeaderboardRowsForUser(meta.userId);
      }

      await this.mailService.sendAnnouncement({
        to,
        title,
        body,
        inlineImage,
        imageUrl,
        imageAlt: title,
        ...(streakUpdate
          ? {
              variant: 'streak_update' as const,
              weekDays,
              footer: this.streakEmailFooter(meta?.type),
              cta: { label: 'START A POMODORO', url: APP_LINK },
            }
          : {}),
        ...(leaderboard
          ? {
              variant: 'leaderboard' as const,
              leaderboardRows: includeBoard ? leaderboardRows : [],
              footer: this.leaderboardEmailFooter(meta?.type),
              cta: { label: 'VIEW LEADERBOARD', url: APP_LINK },
            }
          : {}),
      });
    } catch (err) {
      this.logger.error(
        `Failed to email ${to}: ${title}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

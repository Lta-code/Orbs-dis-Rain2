import { Client, APIGatewayBotInfo } from '@discordjs/core';
import { RequestInit, WebSocket as UndiciWebSocket } from 'undici';
import { REST, DefaultRestOptions, ResponseLike } from '@discordjs/rest';
import { WebSocketManager, WebSocketShard } from '@discordjs/ws';
import { GatewaySendPayload, GatewayOpcodes } from 'discord-api-types/v10';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync, spawn } from 'node:child_process';

export type Snowflake = string;

export interface QuestApplication {
    id: Snowflake;
    name: string;
    link: string;
}

export interface QuestGradient {
    primary: string;
    secondary: string;
}

export interface QuestMessages {
    quest_name: string;
    game_title: string;
    game_publisher: string;
}

export interface QuestTask {
    event_name: string;
    target: number;
    external_ids?: string[];
    title?: string;
    description?: string;
    applications?: { id: string }[];
}

export enum TaskType {
    WATCH_VIDEO = 'WATCH_VIDEO',
    WATCH_VIDEO_ON_MOBILE = 'WATCH_VIDEO_ON_MOBILE',
    WATCH_STREAM = 'WATCH_STREAM',
    PLAY_ON_DESKTOP = 'PLAY_ON_DESKTOP',
    PLAY_ON_DESKTOP_V2 = 'PLAY_ON_DESKTOP_V2',
    STREAM_ON_DESKTOP = 'STREAM_ON_DESKTOP',
    PLAY_ON_XBOX = 'PLAY_ON_XBOX',
    PLAY_ON_PLAYSTATION = 'PLAY_ON_PLAYSTATION',
    PLAY_ON_NINTENDO = 'PLAY_ON_NINTENDO',
    PLAY_ON_MOBILE = 'PLAY_ON_MOBILE',
    PLAY_ACTIVITY = 'PLAY_ACTIVITY',
    PLAY_SOCIAL_GAME = 'PLAY_SOCIAL_GAME',
    JOIN_COMMUNITY = 'JOIN_COMMUNITY',
    SHARE_CONTENT = 'SHARE_CONTENT',
    FOLLOW_SOCIAL = 'FOLLOW_SOCIAL',
    COMPLETE_SURVEY = 'COMPLETE_SURVEY',
    MAKE_PURCHASE = 'MAKE_PURCHASE',
    REDEEM_CODE = 'REDEEM_CODE',
}

export interface QuestTaskConfig {
    type: number;
    join_operator: string;
    tasks: Record<string, QuestTask>;
    enrollment_url?: string;
    developer_application_id?: Snowflake;
}

export interface QuestTaskConfigV2 {
    join_operator: string;
    tasks: Record<string, QuestTask & { type?: string; applications?: { id: string }[] }>;
}

export interface QuestRewardMessages {
    name: string;
    name_with_article: string;
    reward_redemption_instructions_by_platform?: Record<number, string>;
}

export interface QuestReward {
    type: number;
    sku_id: Snowflake;
    asset?: string | null;
    asset_video?: string | null;
    messages: QuestRewardMessages;
    approximate_count?: number | null;
    redemption_link?: string | null;
    expires_at?: string | null;
    orb_quantity?: number;
    quantity?: number;
}

export interface QuestRewardsConfig {
    assignment_method: number;
    rewards: QuestReward[];
    rewards_expire_at: string | null;
    platforms: number;
}

export interface QuestAssets {
    hero: string;
    hero_video: string | null;
    quest_bar_hero: string;
    quest_bar_hero_video: string | null;
    game_tile: string;
    logotype: string;
}

export interface QuestConfig {
    id: Snowflake;
    config_version: number;
    starts_at: string;
    expires_at: string;
    features: number;
    application: QuestApplication;
    assets: QuestAssets;
    colors: QuestGradient;
    messages: QuestMessages;
    task_config?: QuestTaskConfig;
    task_config_v2?: QuestTaskConfigV2;
    rewards_config: QuestRewardsConfig;
}

export interface QuestTaskProgress {
    event_name: string;
    value: number;
    updated_at: string;
    completed_at: string | null;
}

export interface QuestUserStatus {
    user_id: Snowflake;
    quest_id?: Snowflake;
    enrolled_at: string | null;
    completed_at: string | null;
    claimed_at: string | null;
    claimed_tier?: number | null;
    last_stream_heartbeat_at?: string | null;
    stream_progress_seconds?: string | number;
    dismissed_quest_content?: number;
    progress: Record<string, QuestTaskProgress>;
}

export interface QuestData {
    id: Snowflake;
    config: QuestConfig;
    user_status: QuestUserStatus | null;
    targeted_content: number;
    preview: boolean;
}

export interface QuestsApiResponse {
    quests: QuestData[];
    excluded_quests: Partial<QuestData>[];
    quest_enrollment_blocked_until: string | null;
}

export interface BalanceInfo {
    balance: number;
}

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9267 Chrome/138.0.7204.251 Electron/37.6.0 Safari/537.36';

const CLIENT_PROPS = {
    os: 'Windows',
    browser: 'Discord Client',
    release_channel: 'stable',
    client_version: '1.0.9267',
    os_version: '10.0.19045',
    os_arch: 'x64',
    app_arch: 'x64',
    system_locale: 'en-US',
    has_client_mods: false,
    client_launch_id: randomUUID(),
    browser_user_agent: USER_AGENT,
    browser_version: '37.6.0',
    os_sdk_version: '19045',
    client_build_number: 471091,
    native_build_number: 72186,
    client_event_source: null,
    launch_signature: randomUUID(),
    client_heartbeat_session_id: randomUUID(),
    client_app_state: 'focused',
};

// ============================================================================
// TỰ ĐỘNG TRÍCH XUẤT TOKEN TỪ DISCORD DESKTOP QUA CDP 9222 (NẾU .ENV CHƯA CÓ)
// ============================================================================
const CDP_PORT = 9222;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}/json`;

async function fetchCDPTargets(): Promise<any[] | null> {
    try {
        const res = await fetch(CDP_URL, { signal: AbortSignal.timeout(1500) });
        if (!res.ok) return null;
        return (await res.json()) as any[];
    } catch {
        return null;
    }
}

function enableDiscordDevTools() {
    const appData = process.env.APPDATA;
    if (!appData) return;
    for (const folder of ['discord', 'discordptb', 'discordcanary']) {
        const settingsFile = path.join(appData, folder, 'settings.json');
        if (!fs.existsSync(settingsFile)) continue;
        try {
            const raw = fs.readFileSync(settingsFile, 'utf8');
            const data = raw.trim() ? JSON.parse(raw) : {};
            if (data.DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING !== true) {
                data.DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING = true;
                fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2), 'utf8');
            }
        } catch {}
    }
}

async function ensureDiscordCDP(): Promise<any | null> {
    let targets = await fetchCDPTargets();
    if (!targets) {
        enableDiscordDevTools();
        const localAppData = process.env.LOCALAPPDATA;
        if (localAppData) {
            try {
                execSync('taskkill /F /IM Discord.exe', { stdio: 'ignore' });
                await new Promise((r) => setTimeout(r, 2000));
            } catch {}

            for (const dirName of ['Discord', 'DiscordPTB', 'DiscordCanary']) {
                const baseDir = path.join(localAppData, dirName);
                if (!fs.existsSync(baseDir)) continue;
                const appFolders = fs
                    .readdirSync(baseDir, { withFileTypes: true })
                    .filter((e) => e.isDirectory() && e.name.startsWith('app-'))
                    .map((e) => e.name)
                    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                let launched = false;
                for (const f of appFolders) {
                    const exePath = path.join(baseDir, f, 'Discord.exe');
                    if (fs.existsSync(exePath)) {
                        const child = spawn(exePath, [`--remote-debugging-port=${CDP_PORT}`], {
                            cwd: path.dirname(exePath),
                            detached: true,
                            stdio: 'ignore',
                        });
                        child.unref();
                        launched = true;
                        break;
                    }
                }
                if (launched) break;
            }
        }
    }

    const start = Date.now();
    while (Date.now() - start < 45000) {
        targets = await fetchCDPTargets();
        if (Array.isArray(targets)) {
            const main = targets.find((t) => {
                if (t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
                const url = String(t.url || '').toLowerCase();
                return (
                    (url.includes('discord.com/') || url.includes('discordapp.com/')) &&
                    !url.includes('app_bootstrap')
                );
            });
            if (main) return main;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
}

export async function evalInDiscordCDP(expression: string, timeoutMs = 45000): Promise<any> {
    const target = await ensureDiscordCDP();
    if (!target?.webSocketDebuggerUrl) return null;

    return new Promise((resolve) => {
        let settled = false;
        const finish = (val: any) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch {}
            resolve(val);
        };

        const WS = (globalThis as any).WebSocket ?? UndiciWebSocket;
        const ws = new WS(target.webSocketDebuggerUrl);
        const timer = setTimeout(() => finish(null), timeoutMs);

        ws.addEventListener('open', () => {
            ws.send(
                JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: { expression, returnByValue: true, awaitPromise: true },
                })
            );
        });

        ws.addEventListener('message', (event: any) => {
            try {
                const data = JSON.parse(String(event.data));
                if (data.id === 1) {
                    finish(data?.result?.result?.value ?? null);
                }
            } catch {}
        });

        ws.addEventListener('error', () => finish(null));
        ws.addEventListener('close', () => finish(null));
    });
}

export async function ensureDiscordToken(): Promise<string> {
    const envPath = path.join(process.cwd(), '.env');
    if (!process.env.TOKEN && fs.existsSync(envPath)) {
        try {
            const rawEnv = fs.readFileSync(envPath, 'utf8');
            const match = rawEnv.match(/^\s*TOKEN\s*=\s*(.+)\s*$/m);
            if (match?.[1]) {
                process.env.TOKEN = match[1].trim().replace(/^["']|["']$/g, '');
            }
        } catch {}
    }

    const envToken = (process.env.TOKEN || '').trim();
    if (
        envToken &&
        envToken !== 'your_token_account_discord' &&
        envToken !== 'your_discord_user_token_here' &&
        envToken.length > 25
    ) {
        return envToken;
    }

    console.log('⚡ Đang tự động trích xuất Token từ Discord Desktop đang mở...');
    const extractExpr = `(async () => {
        for (let attempt = 0; attempt < 30; attempt++) {
            try {
                const chunkObj = window.webpackChunkdiscord_app;
                if (chunkObj && Array.isArray(chunkObj)) {
                    const reqs = [];
                    const seen = new Set();
                    const sym = Symbol('tok_' + Date.now());
                    chunkObj.push([[sym], {}, r => { if (r && r.c && !seen.has(r)) { seen.add(r); reqs.push(r); } }]);
                    chunkObj.pop();
                    for (const req of reqs) {
                        for (const m of Object.values(req.c)) {
                            const exp = m && m.exports;
                            if (!exp || (typeof exp !== 'object' && typeof exp !== 'function')) continue;
                            try {
                                if (typeof exp.getToken === 'function') {
                                    const tok = exp.getToken();
                                    if (typeof tok === 'string' && tok.length > 25 && !tok.includes(' ')) return tok;
                                }
                            } catch {}
                            for (const k of Reflect.ownKeys(exp)) {
                                try {
                                    const sub = exp[k];
                                    if (sub && typeof sub.getToken === 'function') {
                                        const tok = sub.getToken();
                                        if (typeof tok === 'string' && tok.length > 25 && !tok.includes(' ')) return tok;
                                    }
                                } catch {}
                            }
                        }
                    }
                }
            } catch {}
            await new Promise(r => setTimeout(r, 1000));
        }
        return null;
    })()`;

    const token = await evalInDiscordCDP(extractExpr, 45000);
    if (typeof token === 'string' && token.length > 25) {
        try {
            fs.writeFileSync(envPath, `TOKEN=${token}\n`, 'utf8');
        } catch {}
        process.env.TOKEN = token;
        return token;
    }

    throw new Error('Không thể tự lấy Token. Hãy mở Discord Desktop hoặc điền TOKEN=... vào file .env!');
}

export class Quest {
    private raw: QuestData;

    private constructor(raw: QuestData) {
        this.raw = raw;
    }

    static from(raw: QuestData): Quest {
        return new Quest(raw);
    }

    get id() { return this.raw.id; }
    get config() { return this.raw.config; }
    get userStatus() { return this.raw.user_status; }
    get preview() { return this.raw.preview; }

    isExpired(now: Date = new Date()): boolean {
        return now.getTime() > new Date(this.raw.config.expires_at).getTime();
    }

    isCompleted(): boolean {
        if (this.userStatus?.completed_at) return true;
        const t = this.detectTaskType();
        if (t && this.userStatus?.progress?.[t]?.completed_at) return true;
        return false;
    }

    isEnrolled(): boolean {
        return Boolean(this.userStatus?.enrolled_at);
    }

    isClaimed(): boolean {
        return Boolean(this.userStatus?.claimed_at);
    }

    refreshStatus(status: QuestData['user_status']) {
        if (status && typeof status === 'object') {
            this.raw.user_status = { ...(this.raw.user_status || {}), ...status };
        }
    }

    private getTasks(): Record<string, QuestTask> | null {
        return (this.config.task_config_v2?.tasks ?? this.config.task_config?.tasks ?? null) as Record<string, QuestTask> | null;
    }

    detectTaskType(): TaskType | null {
        const tasks = this.getTasks();
        if (!tasks) return null;
        const priority = [
            TaskType.PLAY_ON_DESKTOP,
            TaskType.PLAY_ON_DESKTOP_V2,
            TaskType.PLAY_ON_XBOX,
            TaskType.PLAY_ON_PLAYSTATION,
            TaskType.PLAY_ON_NINTENDO,
            TaskType.PLAY_ON_MOBILE,
            TaskType.PLAY_SOCIAL_GAME,
            TaskType.PLAY_ACTIVITY,
            TaskType.STREAM_ON_DESKTOP,
            TaskType.WATCH_STREAM,
            TaskType.WATCH_VIDEO,
            TaskType.WATCH_VIDEO_ON_MOBILE,
            TaskType.FOLLOW_SOCIAL,
            TaskType.SHARE_CONTENT,
            TaskType.JOIN_COMMUNITY,
            TaskType.COMPLETE_SURVEY,
            TaskType.REDEEM_CODE,
            TaskType.MAKE_PURCHASE,
        ];
        return priority.find((t) => tasks[t] != null) ?? null;
    }

    getTarget(): number {
        const taskType = this.detectTaskType();
        if (!taskType) return 900;
        return this.getTasks()?.[taskType]?.target ?? 900;
    }

    getProgress(): number {
        const taskType = this.detectTaskType();
        if (!taskType) return 0;
        const val =
            this.userStatus?.progress?.[taskType]?.value ??
            this.userStatus?.progress?.PLAY_ON_DESKTOP?.value ??
            this.userStatus?.progress?.WATCH_VIDEO?.value ??
            Number(this.userStatus?.stream_progress_seconds ?? 0);
        return Number(val) || 0;
    }

    getRemaining(): number {
        return Math.max(0, Math.ceil(this.getTarget() - this.getProgress()));
    }

    getRewardLabel(): string {
        const rewards = this.config.rewards_config?.rewards;
        if (!rewards?.length) return 'Unknown';
        if (rewards[0].orb_quantity) return `${rewards[0].orb_quantity} Orbs`;
        return rewards[0].messages?.name ?? 'Unknown';
    }

    get name(): string {
        return (
            this.config.messages?.quest_name?.trim() ||
            this.config.messages?.game_title?.trim() ||
            this.config.application?.name?.trim() ||
            this.id
        );
    }
}

async function patchedFetch(url: string, init: RequestInit): Promise<ResponseLike> {
    if (init.headers) {
        const h = new Headers(init.headers as any);
        h.set('User-Agent', USER_AGENT);
        if (h.has('Authorization')) h.set('Authorization', h.get('Authorization')!.replace('Bot ', ''));
        h.append('accept-language', 'vi');
        h.append('origin', 'https://discord.com');
        h.append('pragma', 'no-cache');
        h.append('priority', 'u=1, i');
        h.append('referer', 'https://discord.com/channels/@me');
        h.append('sec-ch-ua', '"Not)A;Brand";v="8", "Chromium";v="138"');
        h.append('sec-ch-ua-mobile', '?0');
        h.append('sec-ch-ua-platform', '"Windows"');
        h.append('sec-fetch-dest', 'empty');
        h.append('sec-fetch-mode', 'cors');
        h.append('sec-fetch-site', 'same-origin');
        h.append('x-debug-options', 'bugReporterEnabled');
        h.append('x-discord-locale', 'en-US');
        h.append('x-discord-timezone', 'Asia/Saigon');
        h.append('x-super-properties', Buffer.from(JSON.stringify(CLIENT_PROPS)).toString('base64'));
        init.headers = h;
    }
    return DefaultRestOptions.makeRequest(url, init);
}

const origSend = WebSocketShard.prototype.send;
WebSocketShard.prototype.send = async function (payload: GatewaySendPayload) {
    if (payload.op === GatewayOpcodes.Identify) {
        payload.d = {
            token: payload.d.token,
            properties: { ...CLIENT_PROPS, is_fast_connect: false, gateway_connect_reasons: 'AppSkeleton' },
            capabilities: 0,
            presence: payload.d.presence,
            compress: payload.d.compress,
            client_state: { guild_versions: {} },
        } as any;
    }
    return origSend.call(this, payload);
};

export class Rain2 extends Client {
    public quests: QuestStore | null = null;
    public ws: WebSocketManager;

    constructor(token: string) {
        const rest = new REST({ version: '10', makeRequest: patchedFetch }).setToken(token);
        const gw = new WebSocketManager({ token, intents: 0, rest });
        gw.fetchGatewayInformation = (): Promise<APIGatewayBotInfo> =>
            Promise.resolve({
                url: 'wss://gateway.discord.gg',
                shards: 1,
                session_start_limit: { total: 1000, remaining: 1000, reset_after: 14400000, max_concurrency: 1 },
            });
        super({ rest, gateway: gw });
        this.ws = gw;
    }

    start() {
        return this.ws.connect();
    }

    async loadQuests(): Promise<QuestStore> {
        const res = (await this.rest.get('/quests/@me')) as QuestsApiResponse;
        this.quests = new QuestStore(this, (res.quests || []).map((q) => Quest.from(q)));
        return this.quests;
    }

    async getBalance(): Promise<BalanceInfo> {
        return this.rest.get('/users/@me/virtual-currency/balance') as Promise<BalanceInfo>;
    }
}

export class QuestStore implements Iterable<Quest> {
    private pool = new Map<string, Quest>();
    private engine: Rain2;

    constructor(engine: Rain2, list: Quest[] = []) {
        this.engine = engine;
        list.forEach((q) => this.pool.set(q.id, q));
    }

    [Symbol.iterator](): IterableIterator<Quest> { return this.pool.values(); }
    get count() { return this.pool.size; }
    all(): Quest[] { return Array.from(this.pool.values()); }
    find(id: string) { return this.pool.get(id); }

    pending(): Quest[] {
        return this.all().filter(
            (q) => q.id !== '1412491570820812933' && !q.isCompleted() && !q.isExpired()
        );
    }

    claimable(): Quest[] {
        return this.all().filter((q) => q.isCompleted() && !q.isClaimed() && !q.isExpired());
    }

    async enroll(questId: string) {
        const res = await this.engine.rest.post(`/quests/${questId}/enroll`, {
            body: { location: 11, is_targeted: false, metadata_raw: null },
        });
        this.find(questId)?.refreshStatus(res as any);
    }

    private sleep(ms: number) {
        return new Promise((r) => setTimeout(r, ms));
    }

    async execute(quest: Quest, onProgress?: (remainingSec: number) => void) {
        const taskType = quest.detectTaskType();
        if (!taskType) return;

        if (!quest.isEnrolled()) {
            await this.enroll(quest.id);
        }

        const target = quest.getTarget();
        const done = quest.getProgress();

        if (taskType === TaskType.WATCH_VIDEO || taskType === TaskType.WATCH_VIDEO_ON_MOBILE) {
            await this.executeVideoWatch(quest, taskType, target, done, onProgress);
        } else if (
            taskType === TaskType.PLAY_ON_DESKTOP ||
            taskType === TaskType.PLAY_ON_DESKTOP_V2 ||
            taskType === TaskType.STREAM_ON_DESKTOP
        ) {
            await this.executeDesktopGameplay(quest, taskType, onProgress);
        } else if (
            taskType === TaskType.PLAY_ON_XBOX ||
            taskType === TaskType.PLAY_ON_PLAYSTATION ||
            taskType === TaskType.PLAY_ON_NINTENDO
        ) {
            await this.executeConsoleGameplay(quest, taskType, onProgress);
        } else if (
            taskType === TaskType.PLAY_ON_MOBILE ||
            taskType === TaskType.PLAY_SOCIAL_GAME ||
            taskType === TaskType.PLAY_ACTIVITY
        ) {
            await this.executeMobileGameplay(quest, taskType, onProgress);
        } else if (taskType === TaskType.WATCH_STREAM) {
            await this.executeStreamWatch(quest, onProgress);
        } else if (taskType === TaskType.FOLLOW_SOCIAL) {
            await this.executeSocialFollow(quest);
        } else if (taskType === TaskType.SHARE_CONTENT) {
            await this.executeShareContent(quest);
        } else if (taskType === TaskType.JOIN_COMMUNITY) {
            await this.executeJoinCommunity(quest);
        } else {
            await this.executeGenericProgress(quest);
        }
        // Không tự động gọi POST /claim-reward để tránh dính hCaptcha / Anti-Cheat của Discord
    }

    private async executeVideoWatch(
        quest: Quest,
        taskType: TaskType,
        target: number,
        done: number,
        onProgress?: (remainingSec: number) => void
    ) {
        // Neo mốc bắt đầu theo tiến độ hiện có để không bị bắn vượt tốc độ khi tiếp tục quest đang dở
        const rawEnrolledMs = new Date(quest.userStatus?.enrolled_at as any).getTime();
        const safeAnchorMs = Date.now() - done * 1000;
        const enrolledAt = Number.isNaN(rawEnrolledMs)
            ? safeAnchorMs
            : Math.max(rawEnrolledMs, safeAnchorMs);

        let finished = false;
        let consecutiveErrors = 0;
        let stallCount = 0;

        while (true) {
            const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + 10;
            const diff = maxAllowed - done;
            const next = done + 7;

            if (diff >= 7) {
                const sendTs = Math.min(target, next + Math.random());
                const res = (await this.engine.rest
                    .post(`/quests/${quest.id}/video-progress`, {
                        body: { timestamp: sendTs },
                    })
                    .catch(() => null)) as any;

                if (res) {
                    consecutiveErrors = 0;
                    quest.refreshStatus(res);
                    finished = Boolean(res.completed_at || res.progress?.[taskType]?.completed_at);
                    const srvVal = Number(
                        res.progress?.[taskType]?.value ??
                            res.progress?.WATCH_VIDEO?.value ??
                            res.progress?.WATCH_VIDEO_ON_MOBILE?.value
                    );
                    if (!Number.isNaN(srvVal) && srvVal > done) {
                        done = srvVal;
                        stallCount = 0;
                    } else if (Number.isNaN(srvVal)) {
                        done = Math.min(target, next);
                        stallCount = 0;
                    } else {
                        stallCount++;
                        if (stallCount >= 30 && !finished) {
                            throw new Error('Video progress stalled');
                        }
                    }
                    onProgress?.(Math.max(0, Math.ceil(target - done)));
                } else {
                    consecutiveErrors++;
                    if (consecutiveErrors >= 15) {
                        throw new Error('Video progress rejected');
                    }
                }
            }

            if (finished || done >= target) break;
            await this.sleep(1000);
        }

        for (let retry = 0; retry < 8 && !finished; retry++) {
            const res = (await this.engine.rest
                .post(`/quests/${quest.id}/video-progress`, {
                    body: { timestamp: target },
                })
                .catch(() => null)) as any;
            if (res) {
                quest.refreshStatus(res);
                finished = Boolean(res.completed_at || res.progress?.[taskType]?.completed_at);
                if (finished) break;
            }
            await this.sleep(2000);
        }

        if (!finished && !quest.isCompleted()) {
            throw new Error('Not confirmed');
        }
        onProgress?.(0);
    }

    private async executeDesktopGameplay(
        quest: Quest,
        taskType: TaskType,
        onProgress?: (remainingSec: number) => void
    ) {
        const tasks = quest.config.task_config_v2?.tasks ?? quest.config.task_config?.tasks;
        const taskDef = tasks?.[taskType] as any;
        const idSet = new Set<string>();
        if (Array.isArray(taskDef?.applications)) {
            for (const a of taskDef.applications) {
                if (a?.id) idSet.add(String(a.id));
            }
        }
        if (quest.config.application?.id) idSet.add(String(quest.config.application.id));
        if (quest.name.toLowerCase().includes('roblox')) idSet.add('363445589247131668');
        const candidateIds = Array.from(idSet);
        if (candidateIds.length === 0) candidateIds.push('363445589247131668');

        let idx = 0;
        let activeAppId = candidateIds[0];
        let consecutiveErrors = 0;

        while (!quest.isCompleted()) {
            const res = await this.engine.rest
                .post(`/quests/${quest.id}/heartbeat`, {
                    body: { application_id: activeAppId, terminal: false },
                })
                .catch(() => null);

            if (res) {
                consecutiveErrors = 0;
                quest.refreshStatus(res as any);
            } else {
                // Thử application_id tiếp theo nếu quest hỗ trợ nhiều app (VD: Roblox / sub-game)
                idx = (idx + 1) % candidateIds.length;
                activeAppId = candidateIds[idx];

                const prevRem = quest.getRemaining();
                const latest = (await this.engine.rest.get('/quests/@me').catch(() => null)) as QuestsApiResponse | null;
                const found = latest?.quests?.find((x) => x.id === quest.id);
                if (found?.user_status) {
                    quest.refreshStatus(found.user_status);
                }
                if (quest.getRemaining() < prevRem) {
                    consecutiveErrors = 0;
                } else {
                    consecutiveErrors++;
                    if (consecutiveErrors >= Math.max(6, candidateIds.length * 2)) {
                        throw new Error('Needs Desktop App');
                    }
                }
            }

            onProgress?.(quest.getRemaining());
            if (quest.isCompleted() || quest.getRemaining() <= 0) break;
            await this.sleep(30_000);
        }

        const res = await this.engine.rest
            .post(`/quests/${quest.id}/heartbeat`, {
                body: { application_id: activeAppId, terminal: true },
            })
            .catch(() => null);
        if (res) {
            quest.refreshStatus(res as any);
        }
        onProgress?.(0);
    }

    private async executeConsoleGameplay(
        quest: Quest,
        taskType: TaskType,
        onProgress?: (remainingSec: number) => void
    ) {
        const tasks = quest.config.task_config_v2?.tasks ?? quest.config.task_config?.tasks;
        const taskDef = tasks?.[taskType] as any;
        const appId = taskDef?.applications?.[0]?.id ?? quest.config.application?.id ?? '363445589247131668';

        while (!quest.isCompleted()) {
            const res = await this.engine.rest
                .post(`/quests/${quest.id}/console-heartbeat`, {
                    body: { application_id: appId, platform: taskType.replace('PLAY_ON_', ''), terminal: false },
                })
                .catch(() => null);

            if (res) {
                quest.refreshStatus(res as any);
            }
            onProgress?.(quest.getRemaining());
            if (quest.isCompleted()) break;
            await this.sleep(60_000);
        }

        await this.engine.rest
            .post(`/quests/${quest.id}/console-heartbeat`, {
                body: { application_id: appId, platform: taskType.replace('PLAY_ON_', ''), terminal: true },
            })
            .catch(() => null);
        onProgress?.(0);
    }

    private async executeStreamWatch(quest: Quest, onProgress?: (remainingSec: number) => void) {
        const enrolledAt = new Date(quest.userStatus?.enrolled_at as any).getTime();
        const target = quest.getTarget();
        let done = quest.getProgress();

        while (done < target) {
            const elapsed = Math.floor((Date.now() - enrolledAt) / 1000);
            const next = Math.min(done + 30, target);

            const res = (await this.engine.rest
                .post(`/quests/${quest.id}/stream-progress`, {
                    body: { timestamp: next, elapsed },
                })
                .catch(() => null)) as any;

            done = Math.min(target, next);
            onProgress?.(Math.max(0, target - done));
            if (res?.completed_at) break;
            await this.sleep(30_000);
        }
    }

    private async executeMobileGameplay(
        quest: Quest,
        taskType: TaskType,
        onProgress?: (remainingSec: number) => void
    ) {
        const tasks = quest.config.task_config_v2?.tasks ?? quest.config.task_config?.tasks;
        const taskDef = tasks?.[taskType] as any;
        const appId = taskDef?.applications?.[0]?.id ?? quest.config.application?.id ?? '363445589247131668';

        while (!quest.isCompleted()) {
            const res = await this.engine.rest
                .post(`/quests/${quest.id}/mobile-heartbeat`, {
                    body: { application_id: appId, session_id: randomUUID() },
                })
                .catch(() => null);

            if (res) {
                quest.refreshStatus(res as any);
            }
            onProgress?.(quest.getRemaining());
            if (quest.isCompleted()) break;
            await this.sleep(45_000);
        }
    }

    private async executeSocialFollow(quest: Quest) {
        const res = await this.engine.rest
            .post(`/quests/${quest.id}/social-action`, {
                body: { action: 'follow', platform: 'social' },
            })
            .catch(() => null);
        if (res) quest.refreshStatus(res as any);
    }

    private async executeShareContent(quest: Quest) {
        const res = await this.engine.rest
            .post(`/quests/${quest.id}/social-action`, {
                body: { action: 'share', platform: 'social' },
            })
            .catch(() => null);
        if (res) quest.refreshStatus(res as any);
    }

    private async executeJoinCommunity(quest: Quest) {
        const res = await this.engine.rest
            .post(`/quests/${quest.id}/social-action`, {
                body: { action: 'join', platform: 'community' },
            })
            .catch(() => null);
        if (res) quest.refreshStatus(res as any);
    }

    private async executeGenericProgress(quest: Quest) {
        let attempts = 0;
        while (!quest.isCompleted() && attempts < 100) {
            const res = await this.engine.rest.get(`/quests/${quest.id}/progress`).catch(() => null);
            if (res) quest.refreshStatus(res as any);
            attempts++;
            await this.sleep(10_000);
        }
    }
}

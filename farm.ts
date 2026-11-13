import { GatewayDispatchEvents } from 'discord-api-types/v10';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Rain2, Quest, TaskType, ensureDiscordToken } from './src/engine';

let activeApp: Rain2 | null = null;
let activeTicker: NodeJS.Timeout | null = null;
let inAltScreen = false;

function enterAltScreen() {
    if (!inAltScreen) {
        inAltScreen = true;
        process.stdout.write('\x1b[?1049h\x1b[?25l');
    }
}

function exitAltScreen() {
    if (inAltScreen) {
        inAltScreen = false;
        process.stdout.write('\x1b[?25h\x1b[?1049l');
    }
}

async function shutdownCleanly(exitCode = 0): Promise<never> {
    if (activeTicker) {
        clearInterval(activeTicker);
        activeTicker = null;
    }
    exitAltScreen();
    if (activeApp) {
        const appToClose = activeApp;
        activeApp = null;
        try {
            await appToClose.ws.destroy();
        } catch {}
    }
    process.exit(exitCode);
}

process.on('SIGINT', () => {
    void shutdownCleanly(0);
});
process.on('SIGTERM', () => {
    void shutdownCleanly(0);
});
process.on('SIGHUP', () => {
    void shutdownCleanly(0);
});

const BANNER = `
${chalk.hex('#FF6B6B')('    ____  ')}${chalk.hex('#FF8E53')('    ___   ')}${chalk.hex('#FECA57')('   ____ ')}${chalk.hex('#48DBFB')('    _   __')}${chalk.hex('#FF9FF3')('   ___  ')}
${chalk.hex('#FF6B6B')('   / __ \\ ')}${chalk.hex('#FF8E53')('   /   |  ')}${chalk.hex('#FECA57')('  /  _/ ')}${chalk.hex('#48DBFB')('   / | / /')}${chalk.hex('#FF9FF3')('  |__ \\ ')}
${chalk.hex('#FF6B6B')('  / /_/ / ')}${chalk.hex('#FF8E53')('  / /| |  ')}${chalk.hex('#FECA57')('  / /   ')}${chalk.hex('#48DBFB')('  /  |/ / ')}${chalk.hex('#FF9FF3')('  __/ / ')}
${chalk.hex('#FF6B6B')(' / _, _/  ')}${chalk.hex('#FF8E53')(' / ___ |  ')}${chalk.hex('#FECA57')('_/ /    ')}${chalk.hex('#48DBFB')(' / /|  /  ')}${chalk.hex('#FF9FF3')(' / __/  ')}
${chalk.hex('#FF6B6B')('/_/ |_|   ')}${chalk.hex('#FF8E53')('/_/  |_|  ')}${chalk.hex('#FECA57')('/___/   ')}${chalk.hex('#48DBFB')('/_/ |_/   ')}${chalk.hex('#FF9FF3')('/____/  ')}
`;

const DIVIDER = chalk.hex('#2C3E50')('━'.repeat(90));

type RunState = 'working' | 'done' | 'claimed' | 'skipped' | 'failed';

type LiveQuest = {
    id: string;
    label: string;
    reward: string;
    countdown: number;
    taskIcon: string;
    state: RunState;
};

let live: LiveQuest[] = [];
let orbs: number | null = null;

function taskIcon(t: TaskType | null): string {
    switch (t) {
        case TaskType.WATCH_VIDEO:
        case TaskType.WATCH_VIDEO_ON_MOBILE:
            return '🎬';
        case TaskType.WATCH_STREAM:
            return '📹';
        case TaskType.PLAY_ON_DESKTOP:
        case TaskType.PLAY_ON_DESKTOP_V2:
            return '🎮';
        case TaskType.STREAM_ON_DESKTOP:
            return '📡';
        case TaskType.PLAY_ON_XBOX:
            return '🎯';
        case TaskType.PLAY_ON_PLAYSTATION:
            return '🎪';
        case TaskType.PLAY_ON_NINTENDO:
            return '🔴';
        case TaskType.PLAY_ON_MOBILE:
            return '📱';
        case TaskType.PLAY_ACTIVITY:
        case TaskType.PLAY_SOCIAL_GAME:
            return '🕹️';
        case TaskType.FOLLOW_SOCIAL:
            return '👥';
        case TaskType.SHARE_CONTENT:
            return '📤';
        case TaskType.JOIN_COMMUNITY:
            return '🏘️';
        case TaskType.COMPLETE_SURVEY:
            return '📋';
        case TaskType.MAKE_PURCHASE:
            return '💳';
        case TaskType.REDEEM_CODE:
            return '🎁';
        default:
            return '❓';
    }
}

function clock(sec: number): string {
    if (sec <= 0) return chalk.hex('#00d2d3').bold('● DONE');
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(chalk.hex('#feca57')(`${h}h`));
    parts.push(chalk.hex('#ff9f43')(`${m}m`));
    parts.push(chalk.hex('#ee5a24')(`${s}s`));
    return parts.join(' ');
}

function stateLabel(s: RunState): string {
    switch (s) {
        case 'working':
            return chalk.hex('#0984e3')('⟳ RUNNING');
        case 'done':
            return chalk.hex('#00b894')('✔ DONE');
        case 'claimed':
            return chalk.hex('#6c5ce7')('★ CLAIMED');
        case 'skipped':
            return chalk.hex('#636e72')('⊘ SKIP');
        case 'failed':
            return chalk.hex('#d63031')('✖ FAIL');
    }
}

function draw(user: { username: string; id: string }) {
    const now = new Date();
    const timeStr = chalk.hex('#dfe6e9')(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    );

    const tbl = new Table({
        chars: {
            top: '─',
            'top-mid': '┬',
            'top-left': '┌',
            'top-right': '┐',
            bottom: '─',
            'bottom-mid': '┴',
            'bottom-left': '└',
            'bottom-right': '┘',
            left: '│',
            'left-mid': '├',
            mid: '─',
            'mid-mid': '┼',
            right: '│',
            'right-mid': '┤',
            middle: '│',
        },
        head: [
            chalk.hex('#636e72')('#'),
            chalk.hex('#dfe6e9').bold('QUEST'),
            chalk.hex('#dfe6e9').bold('TYPE'),
            chalk.hex('#dfe6e9').bold('REWARD'),
            chalk.hex('#dfe6e9').bold('REMAINING'),
            chalk.hex('#dfe6e9').bold('STATUS'),
        ],
        colWidths: [4, 32, 9, 18, 14, 13],
        colAligns: ['center', 'left', 'center', 'center', 'center', 'center'],
        style: { border: ['#2d3436'], head: [], 'padding-left': 1, 'padding-right': 1 },
    });

    live.forEach((q, i) => {
        const nameColor = q.state === 'working' ? '#74b9ff' : q.state === 'claimed' ? '#a29bfe' : '#b2bec3';
        tbl.push([
            chalk.hex('#636e72')(`${i + 1}`),
            chalk.hex(nameColor)(q.label.length > 30 ? q.label.slice(0, 28) + '..' : q.label),
            q.taskIcon,
            chalk.hex('#fd79a8')(q.reward),
            clock(q.countdown),
            stateLabel(q.state),
        ]);
    });

    const working = live.filter((q) => q.state === 'working').length;
    const finished = live.filter((q) => q.state === 'done' || q.state === 'claimed').length;
    const bar =
        chalk.hex('#00b894')('█'.repeat(finished)) +
        chalk.hex('#2d3436')('░'.repeat(Math.max(0, live.length - finished)));

    const frame = [
        BANNER,
        DIVIDER,
        `  ${chalk.hex('#74b9ff').bold('⦿')} ${chalk.hex('#dfe6e9')('Account:')} ${chalk.hex('#ffeaa7').bold(user.username)} ${chalk.hex('#636e72')('|')} ${chalk.hex('#dfe6e9')('ID:')} ${chalk.hex('#81ecec')(user.id)} ${chalk.hex('#636e72')('|')} ${chalk.hex('#dfe6e9')('Orbs:')} ${chalk.hex('#a29bfe').bold(orbs !== null ? `🔮 ${orbs}` : '...')} ${chalk.hex('#636e72')('|')} ${timeStr}`,
        DIVIDER,
        tbl.toString(),
        '',
        `  ${chalk.hex('#636e72')('Progress')} ${bar} ${chalk.hex('#dfe6e9')(`${finished}/${live.length}`)} ${chalk.hex('#636e72')(`(${working} active)`)}`,
        '',
        `  ${chalk.hex('#636e72')('Press')} ${chalk.hex('#dfe6e9').bold('Ctrl+C')} ${chalk.hex('#636e72')('to stop')}`,
    ].join('\n');

    process.stdout.write('\x1b[H\x1b[J' + frame);
}

function printClaimableBanner(claimable: Quest[]) {
    if (claimable.length === 0) return;
    console.log(
        chalk.hex('#ffeaa7').bold(`\n  🎁 CÓ ${claimable.length} NHIỆM VỤ ĐÃ HOÀN THÀNH 100% — CHỜ BẠN VÀO DISCORD BẤM NHẬN THƯỞNG (CLAIM):`)
    );
    const claimTbl = new Table({
        chars: {
            top: '─',
            'top-mid': '┬',
            'top-left': '┌',
            'top-right': '┐',
            bottom: '─',
            'bottom-mid': '┴',
            'bottom-left': '└',
            'bottom-right': '┘',
            left: '│',
            'left-mid': '├',
            mid: '─',
            'mid-mid': '┼',
            right: '│',
            'right-mid': '┤',
            middle: '│',
        },
        head: [
            chalk.hex('#dfe6e9')('QUEST'),
            chalk.hex('#dfe6e9')('REWARD'),
            chalk.hex('#dfe6e9')('ACTION'),
        ],
        colWidths: [34, 20, 32],
        style: { border: ['#00b894'], head: [] },
    });
    claimable.forEach((q) => {
        claimTbl.push([
            chalk.hex('#55efc4').bold(q.name.slice(0, 32)),
            chalk.hex('#ffeaa7').bold(q.getRewardLabel()),
            chalk.hex('#00cec9')('Vào Discord bấm Nhận Thưởng'),
        ]);
    });
    console.log(claimTbl.toString());
}

function report(results: PromiseSettledResult<void>[], claimable: Quest[]) {
    console.log(`\n${DIVIDER}`);
    console.log(chalk.hex('#ffeaa7').bold('  ★ EXECUTION REPORT'));
    console.log(DIVIDER);

    const rptTable = new Table({
        chars: {
            top: '─',
            'top-mid': '┬',
            'top-left': '┌',
            'top-right': '┐',
            bottom: '─',
            'bottom-mid': '┴',
            'bottom-left': '└',
            'bottom-right': '┘',
            left: '│',
            'left-mid': '├',
            mid: '─',
            'mid-mid': '┼',
            right: '│',
            'right-mid': '┤',
            middle: '│',
        },
        head: [
            chalk.hex('#dfe6e9')('QUEST'),
            chalk.hex('#dfe6e9')('TYPE'),
            chalk.hex('#dfe6e9')('RESULT'),
            chalk.hex('#dfe6e9')('REWARD'),
        ],
        colWidths: [32, 9, 12, 18],
        style: { border: ['#2d3436'], head: [] },
    });

    results.forEach((r, i) => {
        const q = live[i];
        if (!q) return;
        if (r.status === 'fulfilled') {
            rptTable.push([
                chalk.hex('#74b9ff')(q.label.slice(0, 30)),
                q.taskIcon,
                chalk.hex('#00b894').bold('SUCCESS'),
                chalk.hex('#ffeaa7')(q.reward),
            ]);
        } else {
            const msg = (r.reason as any)?.message?.slice(0, 20) || 'Error';
            rptTable.push([
                chalk.hex('#74b9ff')(q.label.slice(0, 30)),
                q.taskIcon,
                chalk.hex('#d63031').bold('FAILED'),
                chalk.hex('#d63031')(msg),
            ]);
        }
    });

    console.log(rptTable.toString());
    printClaimableBanner(claimable);
    console.log(
        `\n  ${chalk.hex('#a29bfe').bold(`🔮 Current Orbs: ${orbs ?? '?'}`)}  ${chalk.hex('#636e72')('|')}  ${chalk.hex('#00b894').bold('✨ Đã cày xong 100%! Hãy vào Discord bấm Nhận Phần Thưởng (Claim) để an toàn Anti-Cheat.')}`
    );
    console.log(DIVIDER);
}

async function main() {
    const token = await ensureDiscordToken();
    const app = new Rain2(token);
    activeApp = app;

    let readyFired = false;
    const watchdog = setTimeout(async () => {
        if (readyFired) return;
        console.error(
            chalk.red('\n  [ERROR] Quá thời gian kết nối Discord Gateway (30s). Vui lòng kiểm tra mạng hoặc Token!')
        );
        await shutdownCleanly(1);
    }, 30_000);

    app.once(
        GatewayDispatchEvents.Ready,
        async ({ data }: { data: { user: { username: string; id: string } } }) => {
            readyFired = true;
            clearTimeout(watchdog);

            try {
                try {
                    const bal = await app.getBalance();
                    orbs = bal.balance;
                } catch {}

                const store = await app.loadQuests();
                const pending = store.pending();
                const claimable = store.claimable();

                if (pending.length === 0) {
                    process.stdout.write('\x1bc');
                    console.log(BANNER);
                    console.log(DIVIDER);
                    console.log(
                        `  ${chalk.hex('#74b9ff').bold('⦿')} ${chalk.hex('#ffeaa7').bold(data.user.username)} ${chalk.hex('#636e72')('|')} ${chalk.hex('#a29bfe')(`🔮 ${orbs ?? '?'} Orbs`)}`
                    );
                    console.log(DIVIDER);
                    console.log(chalk.hex('#00b894')('\n  ✔ Không có nhiệm vụ nào cần cày thêm. Tất cả đã hoàn tất! ✨'));

                    printClaimableBanner(claimable);

                    const allQuests = store.all();
                    const relevantQuests = allQuests.filter((q) => !q.isExpired() || q.isClaimed() || q.isCompleted());
                    const hiddenExpiredCount = allQuests.length - relevantQuests.length;

                    if (relevantQuests.length > 0) {
                        console.log(chalk.hex('#dfe6e9').bold('\n  📋 DANH SÁCH NHIỆM VỤ ĐÃ HOÀN THÀNH / CÒN HIỆU LỰC:'));
                        const summaryTbl = new Table({
                            chars: {
                                top: '─',
                                'top-mid': '┬',
                                'top-left': '┌',
                                'top-right': '┐',
                                bottom: '─',
                                'bottom-mid': '┴',
                                'bottom-left': '└',
                                'bottom-right': '┘',
                                left: '│',
                                'left-mid': '├',
                                mid: '─',
                                'mid-mid': '┼',
                                right: '│',
                                'right-mid': '┤',
                                middle: '│',
                            },
                            head: [
                                chalk.hex('#dfe6e9')('Quest'),
                                chalk.hex('#dfe6e9')('Status'),
                                chalk.hex('#dfe6e9')('Reward'),
                                chalk.hex('#dfe6e9')('Type'),
                            ],
                            colWidths: [32, 16, 18, 10],
                            style: { border: ['#2d3436'], head: [] },
                        });
                        relevantQuests.forEach((q) => {
                            let st = '❓';
                            if (q.isClaimed()) st = chalk.hex('#6c5ce7')('★ Claimed');
                            else if (q.isCompleted() && !q.isExpired()) st = chalk.hex('#00b894').bold('🎁 Ready Claim');
                            else if (q.isCompleted()) st = chalk.hex('#00b894')('✔ Done');
                            else st = chalk.hex('#0984e3')('⏳ Active');
                            summaryTbl.push([
                                chalk.hex('#74b9ff')(q.name.slice(0, 30)),
                                st,
                                chalk.hex('#fd79a8')(q.getRewardLabel()),
                                taskIcon(q.detectTaskType()),
                            ]);
                        });
                        console.log(summaryTbl.toString());
                    }

                    if (hiddenExpiredCount > 0) {
                        console.log(
                            chalk.hex('#636e72')(`  (Đã ẩn ${hiddenExpiredCount} nhiệm vụ cũ đã hết hạn để gọn màn hình)`)
                        );
                    }

                    await shutdownCleanly(0);
                    return;
                }

                live = pending.map((q) => ({
                    id: q.id,
                    label: q.name,
                    reward: q.getRewardLabel(),
                    countdown: q.getRemaining(),
                    taskIcon: taskIcon(q.detectTaskType()),
                    state: 'working' as RunState,
                }));

                enterAltScreen();

                activeTicker = setInterval(() => {
                    live.forEach((q) => {
                        if (q.state === 'working' && q.countdown > 1) q.countdown--;
                    });
                    draw(data.user);
                }, 1000);

                const results = await Promise.allSettled(
                    pending.map(async (q, idx) => {
                        const staggerMs = idx * 2500 + Math.floor(Math.random() * 800);
                        if (staggerMs > 0) {
                            await new Promise((r) => setTimeout(r, staggerMs));
                        }
                        await store.execute(q, (rem) => {
                            if (live[idx]) {
                                live[idx].countdown = rem;
                                if (rem <= 0) live[idx].state = 'done';
                            }
                        });
                    })
                );

                if (activeTicker) {
                    clearInterval(activeTicker);
                    activeTicker = null;
                }
                exitAltScreen();

                results.forEach((r, i) => {
                    if (!live[i]) return;
                    live[i].state = r.status === 'fulfilled' ? 'done' : 'failed';
                    live[i].countdown = 0;
                });

                draw(data.user);
                report(results, store.claimable());
                await shutdownCleanly(0);
            } catch (err: any) {
                exitAltScreen();
                console.error(chalk.red(`\n  [ERROR] ${err?.message || err}`));
                await shutdownCleanly(1);
            }
        }
    );

    await app.start();
}

main().catch(async (err) => {
    exitAltScreen();
    console.error(chalk.red(`\n  [ERROR] ${err?.message || err}`));
    await shutdownCleanly(1);
});

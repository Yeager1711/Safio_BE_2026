import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActiveLog } from '../../../../entities/active_logs.entity';
import { WarningType } from '../../../../entities/warning_type.entity';
import { SafioAIContext } from '../ai.service';

type FallLevel = '1' | '2' | '3' | 'unknown';

interface FallRawRow {
        log_id: string;
        warning_level?: string | null;
        warning_description?: string | null;
        camera_name?: string | null;
}

@Injectable()
export class FallDetectionContextService {
        constructor(
                @InjectRepository(ActiveLog)
                private readonly activeLogRepo: Repository<ActiveLog>,
                @InjectRepository(WarningType)
                private readonly warningTypeRepo: Repository<WarningType>
        ) {}

        private normalizeLevel(level: string | null | undefined): FallLevel {
                if (!level) return 'unknown';

                const value = String(level)
                        .toLowerCase()
                        .trim()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '');

                if (
                        value === 'low' ||
                        value === '1' ||
                        value.includes('nhe') ||
                        value.includes('cap 1')
                ) {
                        return '1';
                }

                if (
                        value === 'medium' ||
                        value === '2' ||
                        value.includes('trung') ||
                        value.includes('cap 2')
                ) {
                        return '2';
                }

                if (
                        value === 'high' ||
                        value === 'critical' ||
                        value === '3' ||
                        value.includes('nghiem') ||
                        value.includes('cap 3')
                ) {
                        return '3';
                }

                return 'unknown';
        }

        private getLevelLabel(level: string | null | undefined): string {
                const normalized = this.normalizeLevel(level);

                switch (normalized) {
                        case '1':
                                return 'Cấp 1 (Nhẹ)';
                        case '2':
                                return 'Cấp 2 (Trung bình)';
                        case '3':
                                return 'Cấp 3 (Nghiêm trọng)';
                        default:
                                return level || 'Không rõ';
                }
        }

        private buildRawLevelMap(rows: FallRawRow[]) {
                return new Map(
                        rows.map((row) => [
                                row.log_id,
                                {
                                        level: row.warning_level || 'unknown',
                                        description: row.warning_description || undefined,
                                        cameraName: row.camera_name || 'Không rõ',
                                },
                        ])
                );
        }

        private async getWarningDataForLogs(logIds: string[]) {
                if (!logIds.length) {
                        return new Map<
                                string,
                                { level: string; description?: string; cameraName?: string }
                        >();
                }

                const rows = await this.activeLogRepo
                        .createQueryBuilder('log')
                        .leftJoin('warning_types', 'wt', 'wt.id = log.warning_type_id')
                        .leftJoin('cameras', 'cam', 'cam.id = log.cam_id') // JOIN CAMERA
                        .select('log.id', 'log_id')
                        .addSelect('wt.level', 'warning_level')
                        .addSelect('wt.description', 'warning_description')
                        .addSelect('cam.cam_name', 'camera_name') // LẤY TÊN CAMERA
                        .where('log.id IN (:...ids)', { ids: logIds })
                        .getRawMany<FallRawRow>();

                return this.buildRawLevelMap(rows);
        }

        private async mapLogsToEvents(logs: ActiveLog[]): Promise<SafioAIContext['fallEvents']> {
                if (!logs.length) return [];

                const warningMap = await this.getWarningDataForLogs(logs.map((log) => log.id));

                return logs.map((log) => {
                        const warning = warningMap.get(log.id);

                        const description =
                                log.content_logs ||
                                log.behavior ||
                                warning?.description ||
                                log.fall_type ||
                                'Không có mô tả';

                        return {
                                id: log.id,
                                createdAt: log.createdAt || log.created,
                                level: warning?.level || 'unknown',
                                cameraName: warning?.cameraName || 'Không rõ',
                                personName: log.person_id ? `Người #${log.person_id}` : 'Không rõ',
                                snapshot_url: log.snapshot_url || undefined,
                                description,
                        };
                });
        }

        async getFallStats(userId: string): Promise<SafioAIContext['fallStats']> {
                const logs = await this.activeLogRepo
                        .createQueryBuilder('log')
                        .where('log.user_id = :userId', { userId })
                        .orderBy('log.created_at', 'DESC')
                        .getMany();

                if (!logs.length) {
                        return {
                                total: 0,
                                level1: 0,
                                level2: 0,
                                level3: 0,
                        };
                }

                const warningMap = await this.getWarningDataForLogs(logs.map((log) => log.id));

                let level1 = 0;
                let level2 = 0;
                let level3 = 0;

                for (const log of logs) {
                        const warning = warningMap.get(log.id);
                        const level = this.normalizeLevel(warning?.level);

                        if (level === '1') level1++;
                        else if (level === '2') level2++;
                        else if (level === '3') level3++;
                }

                const latestLog = logs[0];
                const latestWarning = warningMap.get(latestLog.id);

                return {
                        total: logs.length,
                        level1,
                        level2,
                        level3,
                        latest: {
                                createdAt: latestLog.createdAt || latestLog.created,
                                cameraName: latestWarning?.cameraName || 'Không rõ',
                                level: latestWarning?.level || latestLog.fall_type || 'unknown',
                                snapshot_url: latestLog.snapshot_url,
                        },
                };
        }

        async getFallEventsByDate(
                userId: string,
                dateStr: string
        ): Promise<SafioAIContext['fallEvents']> {
                let year: string;
                let month: string;
                let day: string;

                if (dateStr.includes('/')) {
                        [day, month, year] = dateStr.split('/');
                } else {
                        [year, month, day] = dateStr.split('-');
                }

                const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

                const start = new Date(`${normalizedDate}T00:00:00`);
                const end = new Date(`${normalizedDate}T23:59:59.999`);

                const logs = await this.activeLogRepo
                        .createQueryBuilder('log')
                        .where('log.user_id = :userId', { userId })
                        .andWhere('log.created_at BETWEEN :start AND :end', { start, end })
                        .orderBy('log.created_at', 'DESC')
                        .getMany();

                return this.mapLogsToEvents(logs);
        }

        async getRecentFallEvents(
                userId: string,
                limit = 25
        ): Promise<SafioAIContext['fallEvents']> {
                const logs = await this.activeLogRepo
                        .createQueryBuilder('log')
                        .where('log.user_id = :userId', { userId })
                        .orderBy('log.created_at', 'DESC')
                        .take(limit)
                        .getMany();

                return this.mapLogsToEvents(logs);
        }

        async getLevel3FallEvents(userId: string): Promise<SafioAIContext['fallEvents']> {
                const logs = await this.activeLogRepo
                        .createQueryBuilder('log')
                        .innerJoin('warning_types', 'wt', 'wt.id = log.warning_type_id')
                        .where('log.user_id = :userId', { userId })
                        .andWhere(
                                `(LOWER(wt.level) = 'high' OR LOWER(wt.level) = 'critical' OR LOWER(wt.level) = '3')`
                        )
                        .orderBy('log.created_at', 'DESC')
                        .getMany();

                return this.mapLogsToEvents(logs);
        }

        async getLevel3FallEventsByDate(
                userId: string,
                dateStr: string
        ): Promise<SafioAIContext['fallEvents']> {
                let year: string;
                let month: string;
                let day: string;

                if (dateStr.includes('/')) {
                        [day, month, year] = dateStr.split('/');
                } else {
                        [year, month, day] = dateStr.split('-');
                }

                const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

                const start = new Date(`${normalizedDate}T00:00:00`);
                const end = new Date(`${normalizedDate}T23:59:59.999`);

                const logs = await this.activeLogRepo
                        .createQueryBuilder('log')
                        .innerJoin('warning_types', 'wt', 'wt.id = log.warning_type_id')
                        .where('log.user_id = :userId', { userId })
                        .andWhere('log.created_at BETWEEN :start AND :end', { start, end })
                        .andWhere(
                                `(LOWER(wt.level) = 'high' OR LOWER(wt.level) = 'critical' OR LOWER(wt.level) = '3')`
                        )
                        .orderBy('log.created_at', 'DESC')
                        .getMany();

                return this.mapLogsToEvents(logs);
        }

        extractDateFromQuestion(question: string): string | null {
                const match = question.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);

                if (!match) return null;

                const [, day, month, year] = match;
                return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }

        isAskingLevel3(question: string): boolean {
                const text = question
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '');

                return (
                        text.includes('muc 3') ||
                        text.includes('muc do 3') ||
                        text.includes('cap 3') ||
                        text.includes('cap do 3') ||
                        text.includes('muc nghiem trong') ||
                        text.includes('cap nghiem trong') ||
                        text.includes('level 3') ||
                        text.includes('level3') ||
                        text.includes('high') ||
                        text.includes('critical')
                );
        }
}

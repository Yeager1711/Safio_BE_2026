import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import nodemailer from 'nodemailer';

import { ActiveLog } from '../../entities/active_logs.entity';
import { Camera } from '../../entities/camera.entity';
import { User } from '../../entities/users.entity';
import { WarningType } from '../../entities/warning_type.entity';
import { FamilyMember } from '../../entities/family-member.entity';
import { Notification } from '../../entities/notifications.entity';

import { CreateFallDetectionDto } from './dto/create-fall-detection.dto';
import { GetFallTimelineDto } from './dto/get-fall-timeline.dto';

@Injectable()
export class FallDetectionService {
        private readonly logger = new Logger(FallDetectionService.name);

        private transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                        user: process.env.GOOGLE_EMAIL,
                        pass: process.env.GOOGLE_APP_PASSWORD,
                },
        });

        constructor(
                @InjectRepository(ActiveLog)
                private readonly activeLogRepository: Repository<ActiveLog>,

                @InjectRepository(Camera)
                private readonly cameraRepository: Repository<Camera>,

                @InjectRepository(User)
                private readonly userRepository: Repository<User>,

                @InjectRepository(WarningType)
                private readonly warningTypeRepository: Repository<WarningType>,

                @InjectRepository(FamilyMember)
                private readonly familyMemberRepository: Repository<FamilyMember>,

                @InjectRepository(Notification)
                private readonly notificationRepository: Repository<Notification>
        ) {}

        // =========================================================
        // SEND FALL DETECTION EMAIL
        // =========================================================

        private async sendFallEmail(options: {
                recipients: string[];
                level: string;
                description?: string;
                camName: string;
                camId: string;
                timestamp: string;
                snapshot?: string;
                fallType?: string;
                behavior?: string;
        }) {
                if (!options.recipients.length) {
                        this.logger.warn('Không có email thành viên gia đình để gửi cảnh báo');
                        return;
                }

                const level = String(options.level).toLowerCase();

                let subject = '';
                let title = '';
                let borderColor = '#ff9800';
                let backgroundColor = '#fff8e1';
                let textColor = '#e65100';
                let message = '';

                if (level === '1' || level === 'low' || level === 'nhẹ') {
                        subject = `[MỨC 1] Phát hiện té ngã - ${options.camName}`;
                        title = 'CẢNH BÁO TÉ NGÃ - MỨC 1';

                        borderColor = '#ff9800';
                        backgroundColor = '#fff8e1';
                        textColor = '#e65100';

                        message =
                                'Hệ thống vừa phát hiện một sự kiện té ngã. Vui lòng kiểm tra người được giám sát.';
                } else if (level === '2' || level === 'medium' || level === 'trung bình') {
                        subject = `[MỨC 2] Chưa phục hồi - ${options.camName}`;
                        title = 'CẢNH BÁO TÉ NGÃ - MỨC 2';

                        borderColor = '#e53935';
                        backgroundColor = '#ffebee';
                        textColor = '#c62828';

                        message =
                                'Người được giám sát chưa được phát hiện đứng dậy sau khi té. Cần kiểm tra ngay.';
                } else {
                        subject = `[MỨC 3 - KHẨN CẤP] Té ngã - ${options.camName}`;
                        title = 'KHẨN CẤP - TÉ NGÃ MỨC 3';

                        borderColor = '#b71c1c';
                        backgroundColor = '#ffebee';
                        textColor = '#b71c1c';

                        message =
                                'Người được giám sát chưa phục hồi trong thời gian dài. Có khả năng đang gặp nguy hiểm và cần được hỗ trợ khẩn cấp.';
                }

                const html = `
            <div
                style="
                    font-family: Arial, sans-serif;
                    max-width: 650px;
                    border: 3px solid ${borderColor};
                    padding: 20px;
                    border-radius: 12px;
                    background: ${backgroundColor};
                "
            >
                <h2
                    style="
                        color: ${textColor};
                        margin: 0 0 20px 0;
                    "
                >
                    ${title}
                </h2>

                <p>
                    <strong>Camera:</strong>
                    ${options.camName}
                </p>

                <p>
                    <strong>Camera ID:</strong>
                    ${options.camId}
                </p>

                <p>
                    <strong>Thời gian:</strong>
                    ${options.timestamp}
                </p>

                ${
                        options.description
                                ? `
                    <p>
                        <strong>Mô tả:</strong>
                        ${options.description}
                    </p>
                `
                                : ''
                }

                ${
                        options.fallType
                                ? `
                    <p>
                        <strong>Loại té:</strong>
                        ${options.fallType}
                    </p>
                `
                                : ''
                }

                ${
                        options.behavior
                                ? `
                    <p>
                        <strong>Hành vi:</strong>
                        ${options.behavior}
                    </p>
                `
                                : ''
                }

                <hr />

                <p
                    style="
                        color: ${textColor};
                        font-weight: bold;
                        font-size: 16px;
                    "
                >
                    ${message}
                </p>

                ${
                        options.snapshot
                                ? `
                    <img
                        src="cid:fall_snapshot"
                        style="
                            width: 100%;
                            max-width: 600px;
                            border-radius: 8px;
                            margin-top: 15px;
                        "
                    />
                `
                                : ''
                }
            </div>
        `;

                const mailOptions: any = {
                        from: `"AI Care System" <${process.env.GOOGLE_EMAIL}>`,
                        to: options.recipients.join(','),
                        subject,
                        html,
                };

                if (options.snapshot) {
                        const imageBuffer = Buffer.from(
                                options.snapshot.replace(/^data:image\/\w+;base64,/, ''),
                                'base64'
                        );

                        mailOptions.attachments = [
                                {
                                        filename: 'fall-snapshot.png',
                                        content: imageBuffer,
                                        encoding: 'base64',
                                        cid: 'fall_snapshot',
                                },
                        ];
                }

                await this.transporter.sendMail(mailOptions);

                this.logger.log(
                        `Đã gửi cảnh báo MỨC ${options.level} tới: ${options.recipients.join(', ')}`
                );
        }

        // =========================================================
        // CREATE FALL DETECTION
        // =========================================================

        async create(userId: string, dto: CreateFallDetectionDto) {
                // -----------------------------------------------------
                // TÌM CAMERA
                // -----------------------------------------------------

                const camera = await this.cameraRepository.findOne({
                        where: {
                                id: dto.cameraId,
                        },
                        relations: ['createdBy', 'familyGroup'],
                });

                if (!camera) {
                        throw new NotFoundException(`Không tìm thấy camera: ${dto.cameraId}`);
                }

                // -----------------------------------------------------
                // TÌM USER
                // -----------------------------------------------------

                const user = await this.userRepository.findOne({
                        where: {
                                id: userId,
                        },
                });

                if (!user) {
                        throw new NotFoundException(`Không tìm thấy user: ${userId}`);
                }

                // -----------------------------------------------------
                // KIỂM TRA CAMERA THUỘC USER
                // -----------------------------------------------------

                if (camera.createdBy?.id !== user.id) {
                        throw new BadRequestException('Camera không thuộc về user này');
                }

                // -----------------------------------------------------
                // TÌM WARNING TYPE
                // -----------------------------------------------------

                let warningType: WarningType | null = null;

                if (dto.warningTypeId) {
                        warningType = await this.warningTypeRepository.findOne({
                                where: {
                                        id: dto.warningTypeId,
                                },
                        });

                        if (!warningType) {
                                throw new NotFoundException(
                                        `Không tìm thấy warning type: ${dto.warningTypeId}`
                                );
                        }
                } else {
                        warningType = await this.warningTypeRepository.findOne({
                                where: {
                                        level: '1',
                                },
                        });

                        if (!warningType) {
                                warningType = await this.warningTypeRepository.findOne({
                                        where: {
                                                level: 'Low',
                                        },
                                });
                        }
                }

                // -----------------------------------------------------
                // TẠO ACTIVE LOG
                // -----------------------------------------------------

                const activeLog = this.activeLogRepository.create({
                        camera,
                        user,

                        person_id: dto.personId,
                        action: dto.action,
                        fall_type: dto.fallType,
                        behavior: dto.behavior,
                        snapshot_url: dto.snapshotUrl,
                        content_logs: dto.contentLogs,

                        warningType: warningType ?? undefined,
                });

                const savedLog = await this.activeLogRepository.save(activeLog);

                // -----------------------------------------------------
                // LẤY FAMILY GROUP
                // -----------------------------------------------------

                const familyMembers: FamilyMember[] = [];

                const familyGroupId = camera.familyGroup?.id;

                if (!familyGroupId) {
                        this.logger.warn(`Camera ${camera.id} chưa có family group`);
                } else {
                        const members = await this.familyMemberRepository.find({
                                where: {
                                        familyGroup: {
                                                id: familyGroupId,
                                        },
                                },
                                relations: ['user'],
                        });

                        familyMembers.push(...members);
                }

                // -----------------------------------------------------
                // LẤY EMAIL CÁC THÀNH VIÊN
                // -----------------------------------------------------

                const recipients = familyMembers
                        .map((member) => member.user)
                        .filter((member): member is User => !!member)
                        .map((member) => member.email)
                        .filter((email): email is string => !!email);

                const uniqueRecipients = [...new Set(recipients)];

                // -----------------------------------------------------
                // GỬI EMAIL
                // -----------------------------------------------------

                let emailSent = false;

                if (uniqueRecipients.length > 0 && warningType) {
                        try {
                                await this.sendFallEmail({
                                        recipients: uniqueRecipients,

                                        level: warningType.level,

                                        description: warningType.description,

                                        camName: camera.cam_name,

                                        camId: camera.id,

                                        timestamp: new Date().toLocaleString('vi-VN', {
                                                timeZone: 'Asia/Ho_Chi_Minh',
                                        }),

                                        snapshot: dto.snapshotUrl,

                                        fallType: dto.fallType,

                                        behavior: dto.behavior,
                                });

                                emailSent = true;
                        } catch (error) {
                                this.logger.error(
                                        'Gửi email cảnh báo té ngã thất bại',

                                        error instanceof Error ? error.stack : String(error)
                                );
                        }
                }

                // -----------------------------------------------------
                // TẠO NOTIFICATION CHO FAMILY MEMBER
                // -----------------------------------------------------

                for (const member of familyMembers) {
                        if (!member.user) {
                                continue;
                        }

                        const notification = this.notificationRepository.create({
                                activeLog: savedLog,

                                recipientUser: member.user,

                                status: emailSent ? 'sent' : 'failed',

                                sent_at: new Date(),
                        });

                        await this.notificationRepository.save(notification);
                }

                // -----------------------------------------------------
                // RESPONSE
                // -----------------------------------------------------

                return {
                        success: true,

                        message: 'Đã ghi nhận té ngã và gửi cảnh báo gia đình',

                        data: {
                                id: savedLog.id,

                                cameraId: camera.id,

                                cameraName: camera.cam_name,

                                userId: user.id,

                                personId: savedLog.person_id,

                                action: savedLog.action,

                                fallType: savedLog.fall_type,

                                behavior: savedLog.behavior,

                                snapshotUrl: savedLog.snapshot_url,

                                contentLogs: savedLog.content_logs,

                                warningType: warningType
                                        ? {
                                                  id: warningType.id,

                                                  level: warningType.level,

                                                  description: warningType.description,
                                          }
                                        : null,

                                notificationCount: familyMembers.filter((member) => !!member.user)
                                        .length,

                                emailSent,

                                createdAt: savedLog.createdAt,
                        },
                };
        }

        // =========================================================
        // GET FALL TIMELINE
        // =========================================================
        async getTimeline(userId: string, query: GetFallTimelineDto) {
                const page = query.page ?? 1;
                const limit = query.limit ?? 50;

                const skip = (page - 1) * limit;

                // =========================================================
                // 1. KIỂM TRA USER
                // =========================================================

                const user = await this.userRepository.findOne({
                        where: {
                                id: userId,
                        },
                });

                if (!user) {
                        throw new NotFoundException('Không tìm thấy người dùng');
                }

                // =========================================================
                // 2. LẤY FAMILY GROUP CỦA USER
                // =========================================================
                //
                // KHÔNG dùng:
                // user.family_group_id
                //
                // Vì User entity hiện tại không có @Column cho field này.
                //
                // Lấy thông qua family_members.
                // =========================================================

                const familyMember = await this.familyMemberRepository.findOne({
                        where: {
                                user: {
                                        id: userId,
                                },
                        },
                        relations: ['familyGroup'],
                });

                if (!familyMember?.familyGroup) {
                        return {
                                success: true,

                                data: [],

                                pagination: {
                                        page,
                                        limit,
                                        total: 0,
                                        totalPages: 0,
                                },
                        };
                }

                const familyGroupId = familyMember.familyGroup.id;

                // =========================================================
                // 3. QUERY ACTIVE LOG
                // =========================================================

                const queryBuilder = this.activeLogRepository
                        .createQueryBuilder('fall')

                        // -------------------------------------------------
                        // CAMERA
                        // -------------------------------------------------

                        .leftJoinAndSelect('fall.camera', 'camera')

                        // -------------------------------------------------
                        // WARNING TYPE
                        // -------------------------------------------------

                        .leftJoinAndSelect('fall.warningType', 'warningType')

                        // -------------------------------------------------
                        // CHỈ LẤY CAMERA THUỘC FAMILY GROUP
                        // -------------------------------------------------

                        .where('camera.family_group_id = :familyGroupId', {
                                familyGroupId,
                        })

                        // -------------------------------------------------
                        // MỚI NHẤT TRƯỚC
                        // -------------------------------------------------

                        .orderBy('fall.createdAt', 'DESC')

                        .skip(skip)
                        .take(limit);

                // =========================================================
                // 4. FILTER WARNING TYPE
                // =========================================================

                if (query.warningTypeId) {
                        queryBuilder.andWhere('warningType.id = :warningTypeId', {
                                warningTypeId: query.warningTypeId,
                        });
                }

                // =========================================================
                // 5. EXECUTE QUERY
                // =========================================================

                const [records, total] = await queryBuilder.getManyAndCount();

                // =========================================================
                // 6. MAP DATA
                // =========================================================

                const data = records.map((fall) => ({
                        id: fall.id,

                        camera: {
                                id: fall.camera?.id ?? null,

                                name: fall.camera?.cam_name ?? null,

                                location: fall.camera?.location ?? null,
                        },

                        // ActiveLog hiện chỉ có person_id
                        // Chưa có relation Person
                        person: {
                                id: fall.person_id ?? null,

                                name: null,
                        },

                        action: fall.action ?? null,

                        fallType: fall.fall_type ?? null,

                        behavior: fall.behavior ?? null,

                        snapshotUrl: fall.snapshot_url ?? null,

                        warning: fall.warningType
                                ? {
                                          id: fall.warningType.id,

                                          name: fall.warningType.level,

                                          level: fall.warningType.level ?? null,

                                          description: fall.warningType.description ?? null,
                                  }
                                : null,

                        createdAt: fall.createdAt,

                        updatedAt: fall.updatedAt,
                }));

                // =========================================================
                // 7. RESPONSE
                // =========================================================

                return {
                        success: true,

                        data,

                        pagination: {
                                page,

                                limit,

                                total,

                                totalPages: Math.ceil(total / limit),
                        },
                };
        }

        // =========================================================
        // FIND ALL
        // =========================================================

        async findAll(userId: string) {
                const logs = await this.activeLogRepository.find({
                        where: {
                                user: {
                                        id: userId,
                                },
                        },

                        relations: ['camera', 'user', 'warningType'],

                        order: {
                                createdAt: 'DESC',
                        },
                });

                return {
                        success: true,
                        data: logs,
                };
        }

        // =========================================================
        // FIND ONE
        // =========================================================

        async findOne(id: string, userId: string) {
                const log = await this.activeLogRepository.findOne({
                        where: {
                                id,

                                user: {
                                        id: userId,
                                },
                        },

                        relations: ['camera', 'user', 'warningType'],
                });

                if (!log) {
                        throw new NotFoundException('Không tìm thấy lịch sử phát hiện té ngã');
                }

                return {
                        success: true,
                        data: log,
                };
        }

        // =========================================================
        // REMOVE
        // =========================================================

        async remove(id: string, userId: string) {
                const log = await this.activeLogRepository.findOne({
                        where: {
                                id,

                                user: {
                                        id: userId,
                                },
                        },
                });

                if (!log) {
                        throw new NotFoundException('Không tìm thấy lịch sử phát hiện té ngã');
                }

                await this.activeLogRepository.remove(log);

                return {
                        success: true,

                        message: 'Xóa lịch sử phát hiện té ngã thành công',
                };
        }
}

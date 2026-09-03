import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

import { ActiveLog } from '../../entities/active_logs.entity';
import { Camera } from '../../entities/camera.entity';
import { User } from '../../entities/users.entity';
import { WarningType } from '../../entities/warning_type.entity';
import { FamilyMember } from '../../entities/family-member.entity';
import { Notification } from '../../entities/notifications.entity';

import { CreateFallDetectionDto } from './dto/create-fall-detection.dto';
import { GetFallTimelineDto } from './dto/get-fall-timeline.dto';
import { UpdateFallWarningDto } from './dto/update-fall-warning.dto';

@Injectable()
export class FallDetectionService {
        private readonly logger = new Logger(FallDetectionService.name);
        private readonly twilioClient = twilio(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
        );

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

                const level = String(options.level).toLowerCase().trim();

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
                } else if (
                        level === '2' ||
                        level === 'medium' ||
                        level === 'trung bình' ||
                        level === 'trung binh'
                ) {
                        subject = `[MỨC 2] Chưa phục hồi - ${options.camName}`;
                        title = 'CẢNH BÁO TÉ NGÃ - MỨC 2';
                        borderColor = '#e53935';
                        backgroundColor = '#ffebee';
                        textColor = '#c62828';
                        message =
                                'Người được giám sát chưa được phát hiện đứng dậy sau khi té. Cần kiểm tra ngay.';
                } else {
                        // Nghiêm trọng / High / Critical / 3
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

        // UPDATE FALL WARNING LEVEL (escalation)
        async updateWarning(userId: string, fallDetectionId: string, dto: UpdateFallWarningDto) {
                const activeLog = await this.activeLogRepository.findOne({
                        where: { id: fallDetectionId },
                        relations: [
                                'camera',
                                'camera.createdBy',
                                'camera.familyGroup',
                                'user',
                                'warningType',
                        ],
                });

                if (!activeLog) {
                        throw new NotFoundException(
                                `Không tìm thấy fall detection: ${fallDetectionId}`
                        );
                }

                if (activeLog.camera?.createdBy?.id !== userId && activeLog.user?.id !== userId) {
                        throw new BadRequestException('Bạn không có quyền cập nhật cảnh báo này');
                }

                const newWarningType = await this.warningTypeRepository.findOne({
                        where: { id: dto.warningTypeId },
                });

                if (!newWarningType) {
                        throw new NotFoundException(
                                `Không tìm thấy warning type: ${dto.warningTypeId}`
                        );
                }

                const getLevelOrder = (level?: string | null): number => {
                        if (!level) return 0;
                        const key = level.toLowerCase().trim();
                        const map: Record<string, number> = {
                                '1': 1,
                                low: 1,
                                nhẹ: 1,
                                '2': 2,
                                medium: 2,
                                'trung bình': 2,
                                'trung binh': 2,
                                '3': 3,
                                high: 3,
                                critical: 3,
                                'nghiêm trọng': 3,
                                'nghiem trong': 3,
                        };
                        return map[key] ?? 0;
                };

                const currentLevel = getLevelOrder(activeLog.warningType?.level);
                const newLevel = getLevelOrder(newWarningType.level);

                if (newLevel <= currentLevel) {
                        this.logger.warn(
                                `Bỏ qua escalation: level hiện tại "${activeLog.warningType?.level}" (${currentLevel}), level mới "${newWarningType.level}" (${newLevel})`
                        );
                        return {
                                success: true,
                                message: 'Warning level không thay đổi (đã ở mức cao hơn hoặc bằng)',
                                data: {
                                        id: activeLog.id,
                                        warningType: activeLog.warningType
                                                ? {
                                                          id: activeLog.warningType.id,
                                                          level: activeLog.warningType.level,
                                                          description:
                                                                  activeLog.warningType.description,
                                                  }
                                                : null,
                                },
                        };
                }

                activeLog.warningType = newWarningType;
                activeLog.content_logs = 'Chưa gọi';
                const savedLog = await this.activeLogRepository.save(activeLog);

                const familyMembers: FamilyMember[] = [];
                const familyGroupId = activeLog.camera?.familyGroup?.id;

                if (familyGroupId) {
                        const members = await this.familyMemberRepository.find({
                                where: {
                                        familyGroup: { id: familyGroupId },
                                },
                                relations: ['user'],
                        });
                        familyMembers.push(...members);
                } else {
                        this.logger.warn(`Camera ${activeLog.camera?.id} chưa có family group`);
                }

                const recipients = familyMembers
                        .map((m) => m.user)
                        .filter((u): u is User => !!u)
                        .map((u) => u.email)
                        .filter((email): email is string => !!email);

                const uniqueRecipients = [...new Set(recipients)];

                let emailSent = false;

                if (uniqueRecipients.length > 0) {
                        try {
                                await this.sendFallEmail({
                                        recipients: uniqueRecipients,
                                        level: newWarningType.level,
                                        description: newWarningType.description,
                                        camName: activeLog.camera?.cam_name ?? 'Unknown',
                                        camId: activeLog.camera?.id ?? '',
                                        timestamp: new Date().toLocaleString('vi-VN', {
                                                timeZone: 'Asia/Ho_Chi_Minh',
                                        }),
                                        snapshot: activeLog.snapshot_url ?? undefined,
                                        fallType: activeLog.fall_type ?? undefined,
                                        behavior: activeLog.behavior ?? undefined,
                                });
                                emailSent = true;
                        } catch (error) {
                                this.logger.error(
                                        'Gửi email escalation thất bại',
                                        error instanceof Error ? error.stack : String(error)
                                );
                        }
                }

                for (const member of familyMembers) {
                        if (!member.user) continue;

                        const notification = this.notificationRepository.create({
                                activeLog: savedLog,
                                recipientUser: member.user,
                                status: emailSent ? 'sent' : 'failed',
                                sent_at: new Date(),
                        });

                        await this.notificationRepository.save(notification);
                }

                return {
                        success: true,
                        message: `Đã cập nhật cảnh báo lên MỨC ${newWarningType.level}`,
                        data: {
                                id: savedLog.id,
                                cameraId: activeLog.camera?.id,
                                cameraName: activeLog.camera?.cam_name,
                                personId: savedLog.person_id,
                                action: savedLog.action,
                                fallType: savedLog.fall_type,
                                behavior: savedLog.behavior,
                                snapshotUrl: savedLog.snapshot_url,
                                warningType: {
                                        id: newWarningType.id,
                                        level: newWarningType.level,
                                        description: newWarningType.description,
                                },
                                previousLevel: currentLevel,
                                emailSent,
                                notificationCount: familyMembers.filter((m) => !!m.user).length,
                                updatedAt: savedLog.updatedAt,
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
        // CALL FAMILY MEMBERS BY TWILIO
        private async callFamilyMembers(familyMembers: FamilyMember[]): Promise<{
                success: boolean;
                called: string[];
                failed: Array<{
                        phone: string;
                        error: string;
                }>;
        }> {
                const message =
                        'Hệ thống phát hiện người thân bạn đang cần hỗ trợ, yêu cầu giám sát ngay.';

                const called: string[] = [];
                const failed: Array<{
                        phone: string;
                        error: string;
                }> = [];

                // Chuẩn hóa số điện thoại về dạng E.164 (+84...)
                const normalizePhone = (phone: string): string => {
                        let cleaned = phone.trim().replace(/\s+/g, '').replace(/-/g, '');

                        // Đã có +84
                        if (cleaned.startsWith('+84')) {
                                return cleaned;
                        }

                        // Bắt đầu bằng 84 (thiếu dấu +)
                        if (cleaned.startsWith('84')) {
                                return `+${cleaned}`;
                        }

                        // Bắt đầu bằng 0 (số Việt Nam thông thường)
                        if (cleaned.startsWith('0')) {
                                return `+84${cleaned.slice(1)}`;
                        }

                        // Các trường hợp khác → thêm + nếu thiếu
                        if (!cleaned.startsWith('+')) {
                                return `+${cleaned}`;
                        }

                        return cleaned;
                };

                const phones = familyMembers
                        .map((member) => member.user?.phone_number)
                        .filter((phone): phone is string => !!phone && phone.trim().length > 0)
                        .map(normalizePhone);

                const uniquePhones = [...new Set(phones)];

                if (!uniquePhones.length) {
                        this.logger.warn(
                                'Không tìm thấy số điện thoại người thân để thực hiện cuộc gọi'
                        );

                        return {
                                success: false,
                                called,
                                failed,
                        };
                }

                for (const phone of uniquePhones) {
                        try {
                                const call = await this.twilioClient.calls.create({
                                        from: process.env.TWILIO_PHONE_NUMBER!,
                                        to: phone,
                                        // Trial account: KHÔNG dùng Google Chirp / Neural voice
                                        // Dùng Polly hoặc bỏ voice để dùng default
                                        twiml: `
                    <Response>
                        <Say language="vi-VN" voice="Polly.Mia">
                            ${message}
                        </Say>
                    </Response>
                `,
                                });

                                called.push(phone);

                                this.logger.log(
                                        `Đã tạo cuộc gọi Twilio tới ${phone}. Call SID: ${call.sid}`
                                );
                        } catch (error) {
                                const errorMessage =
                                        error instanceof Error ? error.message : String(error);

                                failed.push({
                                        phone,
                                        error: errorMessage,
                                });

                                this.logger.error(
                                        `Gọi Twilio tới ${phone} thất bại: ${errorMessage}`
                                );
                        }
                }

                return {
                        success: called.length > 0,
                        called,
                        failed,
                };
        }

        // =========================================================
        // CALL FAMILY FOR FALL WARNING
        async callFamilyForFall(userId: string, fallDetectionId: string) {
                // -----------------------------------------------------
                // 1. TÌM FALL DETECTION
                const activeLog = await this.activeLogRepository.findOne({
                        where: {
                                id: fallDetectionId,
                        },
                        relations: [
                                'camera',
                                'camera.createdBy',
                                'camera.familyGroup',
                                'user',
                                'warningType',
                        ],
                });

                if (!activeLog) {
                        throw new NotFoundException(
                                `Không tìm thấy fall detection: ${fallDetectionId}`
                        );
                }

                // -----------------------------------------------------
                // 2. KIỂM TRA QUYỀN
                if (activeLog.camera?.createdBy?.id !== userId && activeLog.user?.id !== userId) {
                        throw new BadRequestException(
                                'Bạn không có quyền thực hiện cuộc gọi cảnh báo này'
                        );
                }

                // -----------------------------------------------------
                // 3. KIỂM TRA FAMILY GROUP
                const familyGroupId = activeLog.camera?.familyGroup?.id;

                if (!familyGroupId) {
                        throw new BadRequestException('Camera chưa thuộc family group');
                }

                // -----------------------------------------------------
                // 4. LẤY FAMILY MEMBERS
                const familyMembers = await this.familyMemberRepository.find({
                        where: {
                                familyGroup: {
                                        id: familyGroupId,
                                },
                        },
                        relations: ['user'],
                });

                if (!familyMembers.length) {
                        throw new NotFoundException('Không tìm thấy thành viên nào trong gia đình');
                }

                // -----------------------------------------------------
                // 5. GỌI TWILIO
                const callResult = await this.callFamilyMembers(familyMembers);

                // 6. NẾU CÓ ÍT NHẤT 1 CUỘC GỌI ĐƯỢC -> ĐÃ GỌI
                if (callResult.called.length > 0) {
                        activeLog.content_logs = 'Đã gọi';

                        await this.activeLogRepository.save(activeLog);
                }

                return {
                        success: callResult.success,

                        message:
                                callResult.called.length > 0
                                        ? 'Đã thực hiện cuộc gọi cảnh báo đến người thân'
                                        : 'Không thực hiện được cuộc gọi nào',

                        data: {
                                fallDetectionId: activeLog.id,
                                contentLogs: activeLog.content_logs,
                                calledCount: callResult.called.length,
                                called: callResult.called,
                                failedCount: callResult.failed.length,
                                failed: callResult.failed,
                        },
                };
        }
}

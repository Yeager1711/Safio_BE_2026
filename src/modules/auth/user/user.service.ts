import {
        Injectable,
        NotFoundException,
        OnModuleInit,
        Logger,
        BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/users.entity';
import { Role } from '../../../entities/roles.entity';
import { Relative } from '../../../entities/relatives.entity';
import { Camera } from '../../../entities/camera.entity';
import { ActiveLog } from '../../../entities/active_logs.entity';
import { Notification } from '../../../entities/notifications.entity';
import { FamilyMember } from '../../../entities/family-member.entity';
import { FamilyGroup } from '../../../entities/family-group.entity';
import { FaceProfile } from '../../../entities/face_profile.entity';
import { FaceEmbedding } from '../../../entities/face_embedding.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserSession } from 'src/entities/user-session.entity';

@Injectable()
export class UserService implements OnModuleInit {
        private readonly logger = new Logger(UserService.name);
        private adminRoleId: string | null = null;

        constructor(
                @InjectRepository(User)
                private userRepository: Repository<User>,

                @InjectRepository(Role)
                private roleRepository: Repository<Role>,

                @InjectRepository(Relative)
                private relativeRepository: Repository<Relative>,

                @InjectRepository(Camera)
                private cameraRepository: Repository<Camera>,

                @InjectRepository(ActiveLog)
                private activeLogRepository: Repository<ActiveLog>,

                @InjectRepository(Notification)
                private notificationRepository: Repository<Notification>,

                @InjectRepository(FamilyMember)
                private familyMemberRepository: Repository<FamilyMember>,

                @InjectRepository(FamilyGroup)
                private familyGroupRepository: Repository<FamilyGroup>,

                @InjectRepository(FaceProfile)
                private faceProfileRepository: Repository<FaceProfile>,

                @InjectRepository(FaceEmbedding)
                private faceEmbeddingRepository: Repository<FaceEmbedding>,

                private readonly jwtService: JwtService,
                private readonly configService: ConfigService,
                @InjectRepository(UserSession)
                private readonly userSessionRepository: Repository<UserSession>
        ) {}

        // =============================
        // HELPER FUNCTIONS
        private calculateAge(date: Date): number {
                if (!date) return 0;
                const today = new Date();
                const birth = new Date(date);
                let age = today.getFullYear() - birth.getFullYear();
                const m = today.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                return age >= 0 ? age : 0;
        }

        private formatDate(date: Date): string {
                if (!date) return null;
                return new Date(date).toISOString().split('T')[0];
        }

        async onModuleInit() {
                await this.loadAdminRoleId();
        }

        private async loadAdminRoleId() {
                const adminRole = await this.roleRepository.findOne({
                        where: { name: 'admin' },
                        select: ['id'],
                });

                if (adminRole?.id) {
                        this.adminRoleId = adminRole.id;
                        this.logger.log(`Admin role cached: ${this.adminRoleId}`);
                }
        }

        // =============================
        // SEARCH USERS
        async searchUsers(query: string, page = 1, limit = 20) {
                if (!query?.trim()) throw new NotFoundException('Query cannot be empty');

                const skip = (page - 1) * limit;

                const qb = this.userRepository
                        .createQueryBuilder('user')
                        .leftJoinAndSelect('user.role', 'role')
                        .where('role.id != :adminRoleId', {
                                adminRoleId: this.adminRoleId,
                        })
                        .select([
                                'user.id',
                                'user.full_name',
                                'user.email',
                                'user.phone_number',
                                'user.date_of_birth',
                                'user.createdAt',
                                'role.name',
                        ]);

                // Tìm theo ID hoặc text
                if (query.length >= 2) {
                        qb.andWhere(
                                `
                                user.id LIKE :query
                                OR user.full_name LIKE :query
                                OR user.email LIKE :query
                                OR user.phone_number LIKE :query
                                `,
                                {
                                        query: `%${query}%`,
                                }
                        );
                }
                console.log(qb.getSql());
                console.log(qb.getParameters());
                const [users, total] = await qb
                        .skip(skip)
                        .take(limit)
                        .orderBy('user.createdAt', 'DESC')

                        .getManyAndCount();

                return {
                        data: users.map((u) => ({
                                userId: u.id,
                                full_name: u.full_name,
                                email: u.email,
                                phone_number: u.phone_number,
                                role: u.role?.name ?? 'customer',
                                age: this.calculateAge(u.date_of_birth),
                                date_of_birth: this.formatDate(u.date_of_birth),
                                createdAt: u.createdAt,
                        })),
                        pagination: {
                                page,
                                limit,
                                total,
                                totalPages: Math.ceil(total / limit),
                                hasNext: page < Math.ceil(total / limit),
                                hasPrev: page > 1,
                        },
                };
        }

        async getAllUsers() {
                const users = await this.userRepository.find({
                        relations: ['role'],
                        select: {
                                id: true,
                                full_name: true,
                                email: true,
                                phone_number: true,
                                date_of_birth: true,
                                createdAt: true,
                                role: { name: true },
                        },
                });

                return users.map((u) => ({
                        userId: u.id,
                        full_name: u.full_name,
                        email: u.email,
                        phone_number: u.phone_number,
                        role: u.role?.name ?? 'customer',
                        age: this.calculateAge(u.date_of_birth),
                        date_of_birth: this.formatDate(u.date_of_birth),
                        createdAt: u.createdAt,
                }));
        }

        // =============================
        // GET USER PROFILE (Logic phức tạp)
        async getUserProfile(userId: string) {
                const user = await this.userRepository.findOne({
                        where: { id: userId },

                        relations: ['role'],

                        select: {
                                id: true,
                                full_name: true,
                                email: true,
                                phone_number: true,
                                date_of_birth: true,

                                createdAt: true,
                                updatedAt: true,

                                require_face_id: true,

                                role: {
                                        name: true,
                                },
                        },
                });

                if (!user) throw new NotFoundException('User not found');

                let relatives: any[] = [];

                // Kiểm tra user có trong Family Group không
                const familyMember = await this.familyMemberRepository.findOne({
                        where: { user: { id: userId } },
                        relations: ['familyGroup'],
                });

                if (familyMember) {
                        // Lấy tất cả thành viên trong group
                        const groupMembers = await this.familyMemberRepository.find({
                                where: { familyGroup: { id: familyMember.familyGroup.id } },
                                relations: ['user'],
                        });

                        for (const member of groupMembers) {
                                if (member.user.id === userId) continue;

                                const relation = await this.relativeRepository.findOne({
                                        where: [
                                                {
                                                        user: { id: userId },
                                                        relativeUser: { id: member.user.id },
                                                },
                                                {
                                                        user: { id: member.user.id },
                                                        relativeUser: { id: userId },
                                                },
                                        ],
                                        select: {
                                                id: true,
                                                acceptance_status: true,
                                        },
                                });

                                relatives.push({
                                        user_id: member.user.id,
                                        full_name: member.user.full_name,
                                        email: member.user.email,
                                        phone_number: member.user.phone_number,
                                        relationship: member.relationship ?? 'Người thân',
                                        date_of_birth: member.user.date_of_birth,
                                        group_id: familyMember.familyGroup.id,
                                        source: 'family_group',
                                        acceptance_status:
                                                relation?.acceptance_status ?? 'accepted',
                                });
                        }
                } else {
                        // Lấy từ Relative table
                        const relativeRecords = await this.relativeRepository.find({
                                where: [{ user: { id: userId } }, { relativeUser: { id: userId } }],
                                relations: ['user', 'relativeUser'],
                        });

                        relatives = relativeRecords.map((rel) => {
                                const isRequester = rel.user.id === userId;
                                const target = isRequester ? rel.relativeUser : rel.user;

                                return {
                                        user_id: target.id,
                                        full_name: target.full_name,
                                        email: target.email,
                                        phone_number: target.phone_number,
                                        relationship: rel.relationship,
                                        date_of_birth: target.date_of_birth,
                                        acceptance_status: rel.acceptance_status,
                                        createdAt: rel.createdAt,
                                        source: 'relative',
                                };
                        });
                }

                // Cameras
                const cameras = await this.cameraRepository.find({
                        where: { createdBy: { id: userId } }, // Giả sử createdBy là người tạo camera
                        select: [
                                'id',
                                'cam_name',
                                'location',
                                'ip_address',
                                'status',
                                'camera_type',
                                'createdAt',
                        ],
                        order: { createdAt: 'DESC' },
                });

                const activityLogCount = await this.activeLogRepository.count({
                        where: {
                                user: {
                                        id: userId,
                                },
                        },
                });

                const notificationCount = await this.notificationRepository.count({
                        where: {
                                activeLog: {
                                        user: {
                                                id: userId,
                                        },
                                },
                        },
                });

                return {
                        user: {
                                user_id: user.id,
                                full_name: user.full_name,
                                email: user.email,
                                phone_number: user.phone_number,
                                role: user.role?.name ?? 'customer',

                                age: this.calculateAge(user.date_of_birth),
                                date_of_birth: this.formatDate(user.date_of_birth),

                                created_at: user.createdAt,
                                updated_at: user.updatedAt,
                        },

                        verify_Auth: {
                                require_face_id: user.require_face_id,
                        },

                        relatives,
                        cameras,
                        statistics: {
                                activity_logs: activityLogCount,
                                notifications: notificationCount,
                        },
                };
        }

        /** Kiểm tra user đã có Face Profile + Embedding chưa*/
        async getFaceIdStatus(userId: string) {
                const user = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'require_face_id'],
                });

                if (!user) {
                        throw new NotFoundException('User not found');
                }

                // tinyint(1) → boolean rõ ràng
                const requireFaceId = Boolean(Number(user.require_face_id));

                const faceProfile = await this.faceProfileRepository.findOne({
                        where: { user_id: userId },
                        relations: ['embeddings'],
                });

                const hasFaceProfile = !!faceProfile;
                const embeddingCount = faceProfile?.embeddings?.length ?? 0;
                const hasEmbeddings = embeddingCount > 0;

                const isReady =
                        hasFaceProfile &&
                        (faceProfile.status === 'registered' || faceProfile.status === 'active');

                return {
                        require_face_id: requireFaceId,
                        has_face_profile: hasFaceProfile,
                        has_embeddings: hasEmbeddings,
                        embedding_count: embeddingCount,
                        face_status: faceProfile?.status ?? null,
                        registered_at: faceProfile?.registered_at ?? null,
                        is_ready: isReady,
                };
        }

        async updateRequireFaceId(userId: string, requireFaceId: boolean) {
                const user = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'require_face_id'],
                });

                if (!user) {
                        throw new NotFoundException('User not found');
                }

                if (requireFaceId === true) {
                        const status = await this.getFaceIdStatus(userId);
                        if (!status.is_ready) {
                                throw new BadRequestException(
                                        'Bạn chưa đăng ký khuôn mặt. Vui lòng thêm Face ID trước khi bật tính năng này.'
                                );
                        }
                }

                // Update rõ ràng
                const result = await this.userRepository.update(
                        { id: userId },
                        { require_face_id: requireFaceId }
                );

                console.log('Update result:', result); // debug

                // Re-fetch chắc chắn
                const updated = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'require_face_id'],
                });

                const finalValue = Boolean(Number(updated?.require_face_id));

                return {
                        require_face_id: finalValue,
                        message: finalValue
                                ? 'Đã bật yêu cầu xác thực Face ID'
                                : 'Đã tắt yêu cầu xác thực Face ID',
                };
        }

        // =============================
        // SETUP PROGRESS (cho UI SetupProgress)
        async getSetupProgress(userId: string) {
                // 1. Lấy user
                const user = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'require_face_id'],
                });

                if (!user) {
                        throw new NotFoundException('User not found');
                }

                // 2. Face status
                const faceStatus = await this.getFaceIdStatus(userId);
                const hasFace = faceStatus.is_ready;

                // 3. Camera count
                const cameraCount = await this.cameraRepository.count({
                        where: { createdBy: { id: userId } },
                });

                // 4. Face security
                const faceSecurityEnabled = Boolean(Number(user.require_face_id));

                // 5. Family / Relative count
                let familyCount = 0;

                const familyMember = await this.familyMemberRepository.findOne({
                        where: { user: { id: userId } },
                        relations: ['familyGroup'],
                });

                if (familyMember?.familyGroup?.id) {
                        const totalInGroup = await this.familyMemberRepository.count({
                                where: {
                                        familyGroup: { id: familyMember.familyGroup.id },
                                },
                        });
                        familyCount = Math.max(0, totalInGroup - 1);
                } else {
                        familyCount = await this.relativeRepository.count({
                                where: [
                                        {
                                                user: { id: userId },
                                                acceptance_status: 'accepted',
                                        },
                                        {
                                                relativeUser: { id: userId },
                                                acceptance_status: 'accepted',
                                        },
                                ],
                        });
                }

                // =============================
                // TÍNH PROGRESS (cộng dồn độc lập)
                const WEIGHT = {
                        face: 25,
                        camera: 25,
                        security: 25,
                        family: 25,
                };

                let progress = 0;

                if (hasFace) progress += WEIGHT.face;
                if (cameraCount > 0) progress += WEIGHT.camera;
                if (faceSecurityEnabled) progress += WEIGHT.security;
                if (familyCount > 0) progress += WEIGHT.family;

                progress = Math.min(progress, 100);

                // =============================
                // STEPS
                const steps = [
                        {
                                id: 'account',
                                title: 'Tạo tài khoản',
                                description: 'Tài khoản Safio của bạn đã được tạo.',
                                percentage: 0,
                                completed: true,
                                icon: '👤', // Tài khoản
                        },
                        {
                                id: 'face',
                                title: 'Thiết lập khuôn mặt',
                                description:
                                        'Đăng ký khuôn mặt để xác thực danh tính và tăng cường bảo mật.',
                                percentage: 25,
                                completed: hasFace,
                                icon: '😊', // Khuôn mặt
                                action: 'Thiết lập khuôn mặt',
                        },
                        {
                                id: 'camera',
                                title: 'Kết nối camera',
                                description:
                                        'Thêm ít nhất một camera để bắt đầu theo dõi và bảo vệ không gian.',
                                percentage: 50,
                                completed: cameraCount > 0,
                                icon: '📷', // Camera
                                action: 'Thêm camera',
                        },
                        {
                                id: 'security',
                                title: 'Thiết lập bảo mật',
                                description:
                                        'Chọn các chức năng yêu cầu quét khuôn mặt trước khi sử dụng.',
                                percentage: 75,
                                completed: faceSecurityEnabled,
                                icon: '🔒', // Bảo mật
                                action: 'Thiết lập bảo mật',
                        },
                        {
                                id: 'family',
                                title: 'Thêm người thân',
                                description:
                                        'Kết nối ít nhất một thành viên gia đình để cùng nhận cảnh báo.',
                                percentage: 100,
                                completed: familyCount > 0,
                                icon: '👨‍👩‍👧', // Người thân / Gia đình
                                action: 'Thêm người thân',
                        },
                ];

                const completedSteps = steps.filter((s) => s.completed).length;
                const totalSteps = steps.length;

                // =============================
                // STATUS
                let status: string;
                let statusLabel: string;
                let statusDescription: string;

                if (progress === 0) {
                        status = 'not_started';
                        statusLabel = 'Chưa bắt đầu';
                        statusDescription = 'Hãy bắt đầu thiết lập tài khoản';
                } else if (progress < 75) {
                        status = 'in_progress';
                        statusLabel = 'Đang thiết lập';
                        statusDescription = 'Tiếp tục hoàn thiện các thiết lập';
                } else if (progress < 100) {
                        status = 'almost_done';
                        statusLabel = 'Gần hoàn tất';
                        statusDescription = 'Chỉ còn một bước nữa thôi';
                } else {
                        status = 'completed';
                        statusLabel = 'Hoàn tất thiết lập';
                        statusDescription = 'Tài khoản đã được thiết lập đầy đủ';
                }

                // =============================
                // NEXT STEP
                const nextStep =
                        progress === 100
                                ? null
                                : steps.find((step) => !step.completed && step.id !== 'account') ||
                                  null;

                return {
                        hasFace,
                        cameraCount,
                        faceSecurityEnabled,
                        familyCount,
                        progress,
                        completedSteps,
                        totalSteps,
                        status,
                        statusLabel,
                        statusDescription,
                        nextStep,
                        steps,

                        details: {
                                face: {
                                        has_face_profile: faceStatus.has_face_profile,
                                        has_embeddings: faceStatus.has_embeddings,
                                        embedding_count: faceStatus.embedding_count,
                                        face_status: faceStatus.face_status,
                                        registered_at: faceStatus.registered_at,
                                        is_ready: faceStatus.is_ready,
                                },
                                require_face_id: faceSecurityEnabled,
                        },
                };
        }

        // =============================
        // FORGOT PASSWORD / RESET
        // =============================

        // Lưu OTP tạm (in-memory). Production nên dùng Redis.
        private otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();

        private generateOtp(): string {
                return crypto.randomInt(100000, 999999).toString();
        }

        private async sendOtpEmail(email: string, otp: string): Promise<void> {
                const transporter = nodemailer.createTransport({
                        host: this.configService.get('EMAIL_HOST') || process.env.EMAIL_HOST,
                        port: Number(
                                this.configService.get('EMAIL_PORT') ||
                                        process.env.EMAIL_PORT ||
                                        587
                        ),
                        secure: false,
                        auth: {
                                user:
                                        this.configService.get('EMAIL_USER') ||
                                        process.env.EMAIL_USER,
                                pass:
                                        this.configService.get('EMAIL_PASS') ||
                                        process.env.EMAIL_PASS,
                        },
                });

                await transporter.sendMail({
                        from: `"Safio" <${process.env.EMAIL_USER}>`,
                        to: email,
                        subject: 'Mã OTP khôi phục mật khẩu - Safio',
                        html: `
                        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                                <h2 style="color: #1a1a2e;">Khôi phục mật khẩu Safio</h2>
                                <p>Mã OTP của bạn là:</p>
                                <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; 
                                        background: #f0f4ff; padding: 16px 24px; border-radius: 8px; 
                                        text-align: center; color: #1a1a2e;">
                                ${otp}
                                </div>
                               <p style="color: #666; margin-top: 16px;">
                                        Mã có hiệu lực trong <strong>5 phút</strong>. Không chia sẻ mã này với bất kỳ ai.
                                </p>
                                <p style="color: #999; font-size: 13px;">
                                Nếu bạn không yêu cầu khôi phục mật khẩu, hãy bỏ qua email này.
                                </p>
                        </div>
                        `,
                });
        }

        /**
         * POST /users/forgot-password
         * Luôn trả về message chung để tránh email enumeration.
         */
        async forgotPassword(email: string) {
                const normalizedEmail = email.trim().toLowerCase();

                const user = await this.userRepository.findOne({
                        where: { email: normalizedEmail },
                        select: ['id', 'email', 'full_name'],
                });

                // Báo lỗi rõ ràng nếu email không tồn tại
                if (!user) {
                        throw new BadRequestException('Email không tồn tại trong hệ thống.');
                }

                this.otpStore.delete(normalizedEmail);

                const otp = this.generateOtp();
                const expiresAt = Date.now() + 5 * 60 * 1000; // 5 phút

                this.otpStore.set(normalizedEmail, {
                        otp,
                        expiresAt,
                        attempts: 0,
                });

                try {
                        await this.sendOtpEmail(user.email, otp);
                        this.logger.log(`OTP sent to ${normalizedEmail}`);
                } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err);
                        this.logger.error(
                                `Failed to send OTP email to ${normalizedEmail}: ${message}`
                        );
                        throw new BadRequestException(
                                'Không thể gửi mã OTP. Vui lòng thử lại sau.'
                        );
                }

                return {
                        message: 'Mã xác thực đã được gửi đến hộp thư của bạn.',
                };
        }

        /** POST /users/verify-reset-otp *Trả về resetToken (JWT ngắn hạn) khi OTP hợp lệ.*/
        async verifyResetOtp(email: string, otp: string) {
                const normalizedEmail = email.trim().toLowerCase();
                const record = this.otpStore.get(normalizedEmail);

                if (!record) {
                        throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn.');
                }

                if (Date.now() > record.expiresAt) {
                        this.otpStore.delete(normalizedEmail);
                        throw new BadRequestException('Mã OTP đã hết hạn. Vui lòng gửi lại.');
                }

                // Giới hạn số lần thử
                if (record.attempts >= 5) {
                        this.otpStore.delete(normalizedEmail);
                        throw new BadRequestException(
                                'Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại OTP.'
                        );
                }

                if (record.otp !== otp) {
                        record.attempts += 1;
                        this.otpStore.set(normalizedEmail, record);
                        throw new BadRequestException('Mã OTP không hợp lệ.');
                }

                // OTP đúng → xóa OTP và tạo resetToken
                this.otpStore.delete(normalizedEmail);

                const user = await this.userRepository.findOne({
                        where: { email: normalizedEmail },
                        select: ['id', 'email'],
                });

                if (!user) {
                        throw new BadRequestException('Người dùng không tồn tại.');
                }

                const resetToken = this.jwtService.sign(
                        {
                                sub: user.id,
                                email: user.email,
                                purpose: 'password_reset',
                        },
                        {
                                secret:
                                        this.configService.get('JWT_SECRET') ||
                                        process.env.JWT_SECRET ||
                                        'your-secret-key',
                                expiresIn: '15m', // 15 phút để đổi mật khẩu
                        }
                );

                return {
                        resetToken,
                        message: 'Xác thực OTP thành công.',
                };
        }

        /* POST /users/reset-password */
        async resetPassword(resetToken: string, newPassword: string) {
                let payload: { sub: string; email: string; purpose: string };

                try {
                        payload = this.jwtService.verify(resetToken, {
                                secret:
                                        this.configService.get('JWT_SECRET') ||
                                        process.env.JWT_SECRET ||
                                        'your-secret-key',
                        });
                } catch {
                        throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn.');
                }

                if (payload.purpose !== 'password_reset') {
                        throw new BadRequestException('Token không hợp lệ.');
                }

                const user = await this.userRepository.findOne({
                        where: { id: payload.sub },
                        select: ['id', 'email', 'password'], // giả sử field password
                });

                if (!user) {
                        throw new NotFoundException('Người dùng không tồn tại.');
                }

                const hashedPassword = await bcrypt.hash(newPassword, 12);

                await this.userRepository.update(
                        { id: user.id },
                        { password: hashedPassword } // đổi tên field nếu entity của bạn khác
                );

                this.logger.log(`Password reset successful for user ${user.id}`);

                return {
                        message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
                };
        }

        // ============================= API: Đổi mật khẩu =============================

        private changePasswordOtpStore = new Map<
                string,
                { otp: string; expiresAt: number; attempts: number }
        >();

        /**
         * API: Trả OTP để frontend hiển thị + tự điền
         * Chỉ gửi email khi xảy ra lỗi
         */
        async requestChangePasswordOtp(
                userId: string,
                method: 'email' | 'password',
                email?: string,
                currentPassword?: string
        ) {
                const user = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'email', 'password'],
                });

                if (!user) {
                        throw new NotFoundException('Người dùng không tồn tại.');
                }

                // Xác minh theo method
                if (method === 'email') {
                        if (!email || email.trim().toLowerCase() !== user.email.toLowerCase()) {
                                throw new BadRequestException(
                                        'Email không khớp với tài khoản hiện tại.'
                                );
                        }
                } else if (method === 'password') {
                        if (!currentPassword) {
                                throw new BadRequestException('Vui lòng nhập mật khẩu hiện tại.');
                        }
                        const isMatch = await bcrypt.compare(currentPassword, user.password);
                        if (!isMatch) {
                                throw new BadRequestException('Mật khẩu hiện tại không đúng.');
                        }
                } else {
                        throw new BadRequestException('Phương thức xác minh không hợp lệ.');
                }

                // Xóa OTP cũ
                this.changePasswordOtpStore.delete(userId);

                const otp = this.generateOtp();
                const expiresAt = Date.now() + 2 * 60 * 1000; // 2 phút

                this.changePasswordOtpStore.set(userId, {
                        otp,
                        expiresAt,
                        attempts: 0,
                });

                // Chỉ gửi email khi có lỗi xảy ra
                try {
                        // Không gửi email ở đây (để frontend tự điền)
                } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err);
                        this.logger.error(`OTP error, fallback send email: ${message}`);

                        // Chỉ khi lỗi mới gửi email
                        try {
                                await this.sendOtpEmail(user.email, otp);
                                this.logger.log(
                                        `Fallback: Change-password OTP sent to ${user.email}`
                                );
                        } catch (emailErr: unknown) {
                                const emailMsg =
                                        emailErr instanceof Error
                                                ? emailErr.message
                                                : String(emailErr);
                                this.logger.error(`Failed to send fallback email: ${emailMsg}`);
                        }
                }

                // Trả OTP về để frontend tự điền
                return {
                        otp,
                        message: 'Mã OTP đã được tạo. Vui lòng nhập mã để tiếp tục.',
                        expiresIn: 120, // 2 phút
                };
        }
        /**
         * API: Đổi mật khẩu
         * - OTP giữ hiệu lực đến khi đổi thành công hoặc hết hạn (2 phút)
         * - Không cho đặt trùng mật khẩu cũ
         */
        async changePassword(userId: string, otp: string, newPassword: string) {
                const record = this.changePasswordOtpStore.get(userId);

                if (!record) {
                        throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn.');
                }

                if (Date.now() > record.expiresAt) {
                        this.changePasswordOtpStore.delete(userId);
                        throw new BadRequestException('Mã OTP đã hết hạn. Vui lòng lấy mã mới.');
                }

                if (record.attempts >= 5) {
                        this.changePasswordOtpStore.delete(userId);
                        throw new BadRequestException(
                                'Bạn đã nhập sai quá nhiều lần. Vui lòng lấy OTP mới.'
                        );
                }

                if (record.otp !== otp) {
                        record.attempts += 1;
                        this.changePasswordOtpStore.set(userId, record);
                        throw new BadRequestException(
                                'Mã OTP chưa chính xác. Vui lòng kiểm tra lại.'
                        );
                }

                // ===== OTP đúng → KHÔNG xóa ở đây =====

                const user = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'password'],
                });

                if (!user) {
                        throw new NotFoundException('Người dùng không tồn tại.');
                }

                // Kiểm tra không trùng mật khẩu cũ (OTP vẫn còn hiệu lực)
                const isSamePassword = await bcrypt.compare(newPassword, user.password);
                if (isSamePassword) {
                        throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
                }

                // Hash + cập nhật
                const hashedPassword = await bcrypt.hash(newPassword, 12);

                await this.userRepository.update({ id: userId }, { password: hashedPassword });

                // ===== Chỉ xóa OTP SAU KHI đổi mật khẩu thành công =====
                this.changePasswordOtpStore.delete(userId);

                this.logger.log(`Password changed successfully for user ${userId}`);

                return {
                        message: 'Đổi mật khẩu thành công.',
                };
        }

        async getDeviceSessions(userId: string) {
                const sessions = await this.userSessionRepository.find({
                        where: {
                                user_id: userId,
                                is_active: true,
                        },
                        select: [
                                'id',
                                'user_id',
                                'device_id',
                                'device_name',
                                'device_type',
                                'browser',
                                'operating_system',
                                'ip_address',
                                'is_active',
                                'created_at',
                                'last_active_at',
                                'revoked_at',
                        ],
                        order: {
                                last_active_at: 'DESC',
                                created_at: 'DESC',
                        },
                });

                const deviceMap = new Map<string, (typeof sessions)[number]>();

                for (const session of sessions) {
                        const deviceId = session.device_id;

                        const deviceKey = deviceId
                                ? `device:${deviceId}`
                                : [
                                          session.device_name,
                                          session.device_type,
                                          session.browser,
                                          session.operating_system,
                                  ]
                                          .map((value) => value?.trim().toLowerCase() || 'unknown')
                                          .join(':');

                        const existingSession = deviceMap.get(deviceKey);

                        if (!existingSession) {
                                deviceMap.set(deviceKey, session);
                                continue;
                        }

                        const currentTime = new Date(
                                session.last_active_at ?? session.created_at
                        ).getTime();

                        const existingTime = new Date(
                                existingSession.last_active_at ?? existingSession.created_at
                        ).getTime();

                        if (currentTime > existingTime) {
                                deviceMap.set(deviceKey, session);
                        }
                }

                const uniqueSessions = Array.from(deviceMap.values()).sort((a, b) => {
                        const timeA = new Date(a.last_active_at ?? a.created_at).getTime();

                        const timeB = new Date(b.last_active_at ?? b.created_at).getTime();

                        return timeB - timeA;
                });

                return {
                        message: 'Lấy danh sách thiết bị đăng nhập thành công',
                        total: uniqueSessions.length,
                        sessions: uniqueSessions.map((session) => ({
                                id: session.id,
                                deviceId: session.device_id,
                                deviceName: session.device_name,
                                deviceType: session.device_type,
                                browser: session.browser,
                                operatingSystem: session.operating_system,
                                ipAddress: session.ip_address,
                                isActive: session.is_active,
                                loginAt: session.created_at,
                                lastActiveAt: session.last_active_at,
                                revokedAt: session.revoked_at,
                        })),
                };
        }
}

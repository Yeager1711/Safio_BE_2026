import {
        Injectable,
        NotFoundException,
        OnModuleInit,
        Logger,
        BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
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
                private faceEmbeddingRepository: Repository<FaceEmbedding>
        ) {}

        // =============================
        // HELPER FUNCTIONS
        // =============================
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
        // =============================
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
        // =============================
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

        /**
         * Kiểm tra user đã có Face Profile + Embedding chưa
         */
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
                                icon: '👤',
                        },
                        {
                                id: 'face',
                                title: 'Thiết lập khuôn mặt',
                                description:
                                        'Đăng ký khuôn mặt để xác thực danh tính và tăng cường bảo mật.',
                                percentage: 25,
                                completed: hasFace,
                                icon: '◉',
                                action: 'Thiết lập khuôn mặt',
                        },
                        {
                                id: 'camera',
                                title: 'Kết nối camera',
                                description:
                                        'Thêm ít nhất một camera để bắt đầu theo dõi và bảo vệ không gian.',
                                percentage: 50,
                                completed: cameraCount > 0,
                                icon: '▣',
                                action: 'Thêm camera',
                        },
                        {
                                id: 'security',
                                title: 'Thiết lập bảo mật',
                                description:
                                        'Chọn các chức năng yêu cầu quét khuôn mặt trước khi sử dụng.',
                                percentage: 75,
                                completed: faceSecurityEnabled,
                                icon: '⌁',
                                action: 'Thiết lập bảo mật',
                        },
                        {
                                id: 'family',
                                title: 'Thêm người thân',
                                description:
                                        'Kết nối ít nhất một thành viên gia đình để cùng nhận cảnh báo.',
                                percentage: 100,
                                completed: familyCount > 0,
                                icon: '♧',
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
}
